import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
import { ImageMagick, initializeImageMagick, MagickFormat } from 'npm:@imagemagick/magick-wasm@0.0.30';
import { inspectImage, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES } from './image.ts';

// Production deployment requires CLI/Docker bundling of this package's wasm asset.
const wasm = await Deno.readFile(new URL('./magick.wasm', import.meta.url));
await initializeImageMagick(wasm);
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const origins = new Set(['https://kfarmai.com', 'https://www.kfarmai.com', 'http://localhost:8000', 'http://127.0.0.1:8000']);
const requestLimit = MAX_INPUT_BYTES + 16384;
const responseHeaders = (origin: string | null): HeadersInit => ({
  'Access-Control-Allow-Origin': origin && origins.has(origin) ? origin : 'https://kfarmai.com',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Cache-Control': 'no-store',
});
const reply = (status: number, error: string, origin: string | null) => Response.json({ error }, { status, headers: responseHeaders(origin) });

Deno.serve(async (req) => {
  const requestStarted = performance.now();
  const origin = req.headers.get('origin');
  if (origin && !origins.has(origin)) return reply(403, 'origin denied', origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(origin) });
  if (req.method !== 'POST') return reply(405, 'method denied', origin);
  const length = Number(req.headers.get('content-length') || 0);
  if (!Number.isFinite(length) || length < 30 || length > requestLimit) return reply(413, 'upload too large or length unavailable', origin);
  if (!req.headers.get('content-type')?.startsWith('multipart/form-data;')) return reply(415, 'multipart required', origin);
  const bearer = req.headers.get('authorization') || '';
  if (!/^Bearer [^\s]+$/i.test(bearer)) return reply(401, 'authentication required', origin);
  const token = bearer.slice(7);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: bearer } }, auth: { persistSession: false } });
  const { data: auth, error: authError } = await userClient.auth.getUser(token);
  if (authError || !auth.user || auth.user.is_anonymous) return reply(401, 'authentication required', origin);
  let form: FormData;
  try { form = await req.formData(); } catch { return reply(400, 'invalid form', origin); }
  const file = form.get('file');
  const purpose = form.get('purpose');
  const postId = form.get('postId');
  if (!(file instanceof File) || file.size < 30 || file.size > MAX_INPUT_BYTES) return reply(413, 'invalid image size', origin);
  if (purpose !== 'create' && purpose !== 'edit') return reply(400, 'invalid upload purpose', origin);
  if (purpose === 'edit') {
    if (typeof postId !== 'string' || !/^[0-9a-f-]{36}$/i.test(postId)) return reply(400, 'invalid post', origin);
    const { data: post, error } = await userClient.from('posts').select('id,user_id').eq('id', postId).eq('user_id', auth.user.id).maybeSingle();
    if (error || !post || post.user_id !== auth.user.id) return reply(403, 'post ownership denied', origin);
  } else if (postId !== null) return reply(400, 'postId not allowed for create', origin);
  let encoded: Uint8Array;
  let width = 0, height = 0;
  let decodeMs = 0, encodeMs = 0;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inspected = inspectImage(bytes);
    const expectedMime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[inspected.kind];
    if (file.type !== expectedMime) return reply(415, 'declared MIME does not match bytes', origin);
    const started = performance.now();
    encoded = ImageMagick.read(bytes, (image): Uint8Array => {
      decodeMs = performance.now() - started;
      if (image.width !== inspected.width || image.height !== inspected.height) throw new Error('decoder dimension mismatch');
      width = image.width; height = image.height;
      image.strip();
      image.quality = 82;
      // ImageMagick's default WebP method 4 exhausts Edge CPU under concurrent uploads.
      image.settings.setDefine(MagickFormat.WebP, 'method', 0);
      const encodeStarted = performance.now();
      const result = image.write(MagickFormat.WebP, (output) => Uint8Array.from(output));
      encodeMs = performance.now() - encodeStarted;
      return result;
    });
    if (performance.now() - started > 1800 || encoded.length < 30 || encoded.length > MAX_OUTPUT_BYTES || inspectImage(encoded).kind !== 'webp') {
      throw new Error('processing limit');
    }
  } catch { return reply(415, 'image decode or validation failed', origin); }
  // The client never chooses a path. The privileged credential is only used after remote JWT validation and byte re-encoding.
  const folder = purpose === 'edit' ? postId as string : `draft-${crypto.randomUUID()}`;
  const path = `${auth.user.id}/${folder}/${crypto.randomUUID()}.webp`;
  const { error: uploadError } = await admin.storage.from('post-images').upload(path, encoded, {
    contentType: 'image/webp', cacheControl: '3600', upsert: false,
  });
  if (uploadError) return reply(503, 'verified upload unavailable', origin);
  const { data: publicData } = admin.storage.from('post-images').getPublicUrl(path);
  const headers = new Headers(responseHeaders(origin));
  headers.set('Server-Timing',
    `decode;dur=${decodeMs.toFixed(1)}, encode;dur=${encodeMs.toFixed(1)}, total;dur=${(performance.now() - requestStarted).toFixed(1)}`);
  return Response.json({ path, url: publicData.publicUrl, width, height, contentType: 'image/webp' },
    { status: 201, headers });
});
