# Backend npm 취약점 원인 분석

> **분석일:** 2026-09-10
>
> **대상:** Railway Backend 빌드에서 보고된 High 취약점 1건
>
> **조치 상태:** 원인과 노출 범위 분석 완료, 의존성 변경은 별도 작업으로 보류

## 1. 결론

Railway 로그의 High 취약점은 애플리케이션이 직접 사용하는 운영 의존성이 아니라 개발용
`nodemon` 아래의 전이 의존성 `brace-expansion@5.0.7`에서 발생한다.

```text
devDependency nodemon@3.1.14
└─ minimatch@10.2.5
   └─ brace-expansion@5.0.7
```

`npm audit --omit=dev`는 취약점 0건이고, 운영 시작 명령은 `node src/app.js`이므로 현재
요청 처리 경로에서 `nodemon`, `minimatch`, `brace-expansion`을 실행하는 코드는 확인되지
않았다. 따라서 인터넷 사용자가 이 취약점을 직접 악용할 즉시 노출 경로는 확인되지 않았다.

다만 Railway 빌드가 `npm install`로 개발 의존성까지 설치하고 그 `node_modules`를 실행
이미지에 포함한다. 취약한 파일이 운영 산출물에 남아 있고 감사 경고도 실제이므로 낮은
위험으로 오인하거나 방치해서는 안 된다.

## 2. 재현 결과

| 검사 | 결과 |
| --- | --- |
| 전체 `npm audit --json` | High 1건, `brace-expansion` |
| `npm audit --omit=dev --json` | 운영 의존성 취약점 0건 |
| `npm explain brace-expansion` | `nodemon → minimatch → brace-expansion` |
| lockfile·Railway 해석 버전 | `nodemon@3.1.14`, `minimatch@10.2.5`, `brace-expansion@5.0.7` |
| 현재 로컬 `node_modules` | `brace-expansion@5.0.9`; lockfile은 여전히 5.0.7 |
| 최신 `brace-expansion` | `5.0.9` |
| `minimatch@10.2.5` 허용 범위 | `brace-expansion ^5.0.5` |
| `npm audit fix --dry-run` | 변경 0건, 취약점 유지 |

진단 과정에서는 `package.json`과 lockfile을 변경하지 않았다. 현재 로컬 설치 트리만
5.0.9로 해석되지만 clean install과 Railway 배포의 재현 기준은 5.0.7을 고정한 lockfile이다.
따라서 로컬 `npm ls` 결과만으로 해결됐다고 판단할 수 없다.

## 3. 취약점 내용

| Advisory | 영향 범위 | 수정 버전 | 영향 |
| --- | --- | --- | --- |
| [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) / CVE-2026-14257 | v5 `<5.0.8` | `5.0.8` | 제한 없는 결과와 중간 배열 생성으로 메모리 고갈 가능 |
| [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) / CVE-2026-69152 | `>=4 <5.0.9` | `5.0.9` | 5.0.8 완화를 우회해 메모리 고갈·이벤트 루프 정지 가능 |

두 Advisory 모두 High, CVSS 7.5다. 공격이 성립하려면 공격자가 제어하는 brace 패턴을
취약 라이브러리가 확장해야 한다. 현재 Backend의 HTTP 입력이 이 개발 도구 경로로 전달되는
코드는 확인되지 않았다. 두 번째 Advisory가 5.0.8도 포함하므로 최종 목표 버전은 반드시
`5.0.9` 이상이어야 한다.

## 4. 원인

직접 원인은 lockfile이 `brace-expansion@5.0.7`을 고정하고 있는 것이다. 상위 패키지
`minimatch@10.2.5`는 `^5.0.5`를 허용하므로 안전 버전 5.0.9와 호환된다. 그러나 현재
환경의 `npm audit fix --dry-run`과 `npm update brace-expansion --dry-run`은 lockfile을
갱신하지 않았다. `npm audit fix` 안내만 보고 해결된 것으로 판단하면 안 된다.

운영 산출물에 취약 패키지가 들어간 구조적 원인은 Railway 설치 단계에서 개발 의존성을
제외하지 않는 것이다. 애플리케이션 실행에는 `nodemon`이 필요하지 않지만 현재 설치
정책 때문에 함께 배포된다.

## 5. 권장 수정

수정은 별도 변경으로 다음 순서가 안전하다.

1. npm `overrides` 또는 검증된 lockfile 갱신으로 `brace-expansion >=5.0.9`를 강제한다.
2. clean install 뒤 `npm ls brace-expansion`으로 실제 설치 버전을 확인한다.
3. 전체 audit와 `--omit=dev` audit가 모두 0건인지 확인한다.
4. Backend 전체 테스트 485개를 다시 실행한다.
5. Railway 설치를 `npm ci --omit=dev`로 바꿀 수 있는지 migration·start 명령과 함께 검증한다.
6. 배포 로그에서 High 경고가 사라지고 migration, `/health`, 장소 검색·상세가 정상인지 확인한다.

버전 고정과 production-only 설치는 서로 대체 관계가 아니다. 전자는 개발 환경까지 알려진
취약점을 제거하고, 후자는 운영 공격 표면과 이미지 크기를 줄인다. 가능하면 둘 다 적용한다.

## 6. 완료 기준

- `brace-expansion` 실제 설치 버전이 5.0.9 이상
- `npm audit --json` High 0건
- `npm audit --omit=dev --json` 취약점 0건 유지
- Backend 전체 테스트 통과
- Railway 실행 이미지에 불필요한 개발 의존성이 없거나 포함 사유가 문서화됨
- 배포 후 migration, health, TourAPI Gateway 경유 검색·상세 회귀 통과
