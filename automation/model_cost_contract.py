"""Bounded requests and micro-USD accounting; live transport remains absent."""
from decimal import Decimal, InvalidOperation, ROUND_CEILING
import copy
import json
from pathlib import Path
from durable_budget import BudgetBlocked, fingerprint

CONFIG = Path(__file__).with_name('model-pricing-20261010.json')
PUBLIC_MODELS = {'LIGHT': 'gpt-6-luna', 'STANDARD': 'gpt-6.1-sol',
                 'HIGH': 'gpt-6-astra', 'IMAGE': 'gpt-image-2.5-flare'}


def integer(value, maximum, name, minimum=0):
    if type(value) is not int or not minimum <= value <= maximum:
        raise BudgetBlocked('INVALID_' + name)
    return value


def ceil_money(value):
    return int(value.to_integral_value(rounding=ROUND_CEILING))


def quote(contract, tier, *, input_tokens, output_tokens, search_calls=0,
          reasoning='low', fixture=False):
    """Token count includes all instructions/schema; no implicit chat history.

    An attested tokenizer/input accounting implementation is a live prerequisite.
    No context-window or image quality estimate is treated as a billing ceiling.
    """
    if contract.get('version') != '2026-10-10' or not contract.get('sources'):
        raise BudgetBlocked('UNVERIFIED_PRICE_VERSION')
    if not fixture and (contract.get('account_access') != 'VERIFIED'
                        or contract.get('input_accounting') != 'VERIFIED'):
        raise BudgetBlocked('UNVERIFIED_ACCOUNT_OR_INPUT_ACCOUNTING')
    model = contract['models'].get(tier)
    if not model or model.get('public_id_verified') is not True or model.get('pricing_verified') is not True:
        raise BudgetBlocked('UNVERIFIED_MODEL_OR_PRICE')
    if model.get('id') != PUBLIC_MODELS.get(tier) or model.get('source') != 'https://developers.openai.com/api/docs/models/' + model['id']:
        raise BudgetBlocked('UNVERIFIED_MODEL_ID')
    rate_keys = ('text_input', 'image_output') if tier == 'IMAGE' else ('input', 'cached_input', 'cache_write', 'output')
    for key in rate_keys:
        try:
            rate = Decimal(model[key])
        except (InvalidOperation, KeyError, TypeError, ValueError):
            raise BudgetBlocked('INVALID_PRICE') from None
        if not rate.is_finite() or rate <= 0:
            raise BudgetBlocked('INVALID_PRICE')
    if tier == 'HIGH':
        raise BudgetBlocked('HIGH_DISABLED')
    inp = integer(input_tokens, 16000, 'INPUT_TOKENS', 1)
    out = integer(output_tokens, 4000, 'OUTPUT_TOKENS', 1)
    calls = integer(search_calls, 2, 'SEARCH_CALLS')
    search_price = integer(contract['search']['microusd_per_call'], 1000000, 'SEARCH_PRICE', 1)
    if tier == 'IMAGE':
        if calls:
            raise BudgetBlocked('IMAGE_SEARCH_UNSUPPORTED')
        if model.get('maximum_output_image_tokens') is None:
            raise BudgetBlocked('UNBOUNDED_IMAGE_COST')
        image_tokens = integer(model['maximum_output_image_tokens'], 1000000, 'IMAGE_TOKENS', 1)
        maximum = ceil_money(Decimal(model['text_input']) * inp + Decimal(model['image_output']) * image_tokens)
        return {'maximum': maximum, 'tier': tier, 'model': model['id'],
                'input_tokens': inp, 'image_tokens': image_tokens, 'search_calls': 0,
                'payload': {'model': model['id'], 'n': 1, 'size': '1024x1024',
                            'quality': 'low', 'output_format': 'webp'}}
    if reasoning not in model['reasoning']:
        raise BudgetBlocked('UNSUPPORTED_REASONING')
    if calls and contract['search'].get('maximum_content_tokens_per_call') is None:
        raise BudgetBlocked('UNBOUNDED_SEARCH_CONTENT_COST')
    content_bound = contract['search'].get('maximum_content_tokens_per_call')
    if content_bound is not None:
        integer(content_bound, 272000, 'SEARCH_CONTENT_BOUND', 1)
    extra = calls * (content_bound or 0)
    integer(inp + extra, 272000, 'TOTAL_INPUT_TOKENS', 1)
    rate = max(Decimal(model[k]) for k in ('input', 'cached_input', 'cache_write'))
    maximum = ceil_money(rate * (inp + extra) + Decimal(model['output']) * out
                         + Decimal(search_price) * calls)
    payload = {'model': model['id'], 'max_output_tokens': out,
               'reasoning': {'effort': reasoning}, 'service_tier': 'default',
               'store': False, 'truncation': 'disabled', 'tools': []}
    if calls:
        payload.update(tools=[{'type': 'web_search'}], max_tool_calls=calls,
                       parallel_tool_calls=False)
    return dict(maximum=maximum, tier=tier, model=model['id'], input_tokens=inp,
                output_tokens=out, search_calls=calls, extra_input_tokens=extra, payload=payload)


def actual_cost(contract, plan, response):
    """Explicit complete billing categories; missing usage holds full reservation.

    Usage adapters must attest non-overlapping uncached/cached/cache-write counts.
    Candidate has no live adapter claiming these fields exist in an API response.
    """
    if response.get('model') != plan['model'] or response.get('service_tier') != 'default':
        raise BudgetBlocked('USAGE_MODEL_OR_TIER_MISMATCH')
    usage = response['billing_usage']
    model = contract['models'][plan['tier']]
    if plan['tier'] == 'IMAGE':
        i = integer(usage['text_input'], plan['input_tokens'], 'INPUT_USAGE')
        o = integer(usage['image_output'], plan['image_tokens'], 'IMAGE_USAGE')
        total = Decimal(model['text_input']) * i + Decimal(model['image_output']) * o
    else:
        limit = plan['input_tokens'] + plan['extra_input_tokens']
        counts = {k: integer(usage[k], limit, 'INPUT_USAGE') for k in ('input', 'cached_input', 'cache_write')}
        integer(sum(counts.values()), limit, 'INPUT_USAGE')
        o = integer(usage['output'], plan['output_tokens'], 'OUTPUT_USAGE')
        s = integer(usage['search_calls'], plan['search_calls'], 'SEARCH_USAGE')
        total = sum(Decimal(model[k]) * v for k, v in counts.items())
        total += Decimal(model['output']) * o + Decimal(contract['search']['microusd_per_call']) * s
    return ceil_money(total), {'response_id': response['id'], 'model': response['model'], 'usage': usage}


class FixtureCostExecutor:
    """Exercise the same durable pre-call/settlement protocol without any AI API."""
    is_fixture = True

    def __init__(self, budget, contract, transport):
        if getattr(transport, 'is_fixture', False) is not True:
            raise BudgetBlocked('LIVE_TRANSPORT_DISABLED')
        self.budget, self.contract, self.transport = budget, copy.deepcopy(contract), transport

    def execute(self, run_id, operation, channel, plan, request):
        # Recompute the plan; callers cannot lower a reservation or change payload.
        expected = quote(self.contract, plan['tier'], input_tokens=plan['input_tokens'],
                         output_tokens=plan.get('output_tokens', 1), search_calls=plan['search_calls'],
                         reasoning=plan['payload'].get('reasoning', {}).get('effort', 'low'), fixture=True)
        if expected != plan:
            raise BudgetBlocked('COST_PLAN_TAMPERED')
        if request.get('model', plan['model']) != plan['model']:
            raise BudgetBlocked('REQUEST_MODEL_MISMATCH')
        identity = {'request': request, 'plan': plan, 'price_hash': fingerprint(self.contract)}
        reservation = self.budget.reserve(run_id, operation, channel, plan['maximum'], identity)
        return self.budget.execute(reservation, lambda: self.transport(plan['payload'], request),
                                   lambda result: actual_cost(self.contract, plan, result))


def load_contract():
    return json.loads(CONFIG.read_text(encoding='utf-8'))
