# kFarmAI SEO 자동 생성 시스템 준비 문서

## 작업 폴더

실제 프로젝트 루트:

```powershell
cd C:\Users\user\PERSONAL\dev\kfarmai-web
```

아래 경로는 사용하지 않습니다.

```powershell
C:\Users\user\PERSONAL\dev\kfarmai\02_dev\frontend
```

## 배치된 파일

- `kfarmai_10h_seo_worker.py`
- `kb/kfarmai_seo_auto_builder_design.txt`
- `kb/kfarmai_10h_seo_worker_README.txt`
- `README_SEO.md`

준비된 폴더:

- `data/`
- `kb/`
- `logs/`

기존 파일 백업:

- `backup_20260607/sitemap.xml`
- `backup_20260607/kfarmai_10h_seo_worker.py`

## 현재 준비 상태

실제 자동 생성 실행은 하지 않았습니다.

워커는 초안 생성 기준으로 준비되어 있습니다.

- 생성 데이터: `data/seo_drafts.json`
- 생성 HTML: `kb/*.html`
- 로그: `logs/seo_worker.log`
- 기본 상태: `status: "draft"`

`draft` 상태 글은 검수 전 배포 대상이 아닙니다. 워커는 안전을 위해 `draft` HTML에 `noindex, nofollow` 메타 태그를 붙이고, `sitemap.xml`과 `kb/index.html`에는 `published` 상태 글만 반영하도록 보정되어 있습니다.

## 30분 테스트 명령어

사용자가 확인한 뒤에만 실행하세요.

```powershell
python kfarmai_10h_seo_worker.py --root . --hours 0.5 --interval 60 --max-items 20
```

의미:

- 30분 동안 실행
- 60초마다 최대 1개 초안 생성
- 최대 20개까지만 생성
- 결과는 draft 기준

## 10시간 실행 명령어

사용자가 확인한 뒤에만 실행하세요.

```powershell
python kfarmai_10h_seo_worker.py --root . --hours 10 --interval 90 --max-items 300
```

권장 안전 설정:

```powershell
python kfarmai_10h_seo_worker.py --root . --hours 10 --interval 180 --max-items 150
```

## 검수 원칙

자동 생성 글은 바로 공개하지 않습니다.

특히 아래 주제는 반드시 사람이 검수한 뒤 `published` 상태로 전환합니다.

- 농약
- 약제
- 희석배수
- 병해충
- 방제
- 보조사업
- 정책/지원금

농약 관련 글은 농약안전정보시스템 확인 문구와 공식 출처가 있어야 합니다.

검수 완료 전에는 Search Console 제출, sitemap 반영, 주요 페이지 링크 연결을 하지 않습니다.

## sitemap.xml / robots.txt

`sitemap.xml` 기존 내용은 보존했습니다.

`robots.txt`는 새로 생성했고 아래 sitemap 경로만 추가했습니다.

```text
Sitemap: https://kfarmai.com/sitemap.xml
```

워커 실행 시에도 기존 sitemap URL을 읽어 보존하고, `published` 글만 추가하도록 수정되어 있습니다.

## 실행 전 확인

실행 전 아래를 확인하세요.

```powershell
python --version
python kfarmai_10h_seo_worker.py --help
```

`--help`는 실행 안내만 출력하며 SEO 글 생성은 시작하지 않습니다.
