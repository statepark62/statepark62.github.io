"""
refresh_threads_token.py
--------------------------
Threads 장기 액세스 토큰(60일)을 갱신하고, 갱신된 새 토큰을
GitHub Actions Secrets(THREADS_ACCESS_TOKEN)에 자동으로 덮어씁니다.

동작 원리:
  1) 지금 저장된 토큰으로 Threads 갱신 API 호출
     GET https://graph.threads.net/v1.0/refresh_access_token
         ?grant_type=th_refresh_token&access_token={현재토큰}
     -> 새 토큰(60일 재연장)을 받음
  2) GitHub REST API로 저장소의 Public Key를 가져와서
     새 토큰을 암호화(libsodium sealed box)
  3) GitHub REST API로 THREADS_ACCESS_TOKEN Secret을 새 값으로 업데이트

필요한 환경변수:
  THREADS_ACCESS_TOKEN : 현재(갱신 대상) 토큰
  GH_PAT                : "repo" 권한을 가진 GitHub Personal Access Token
                           (Secrets 쓰기 권한 필요. Fine-grained PAT라면
                           "Secrets" 저장소 권한을 Read & Write로 설정)
  GH_REPOSITORY          : "소유자/저장소명" 형식 (예: statepark62/statepark62.github.io)
                           GitHub Actions에서는 기본 제공 변수 GITHUB_REPOSITORY로 자동 채워짐

주의:
  - Threads 토큰은 "발급 후 24시간이 지나야" 갱신이 가능합니다.
    (발급 직후 바로 갱신 시도하면 실패할 수 있습니다.)
  - 갱신은 만료 전에만 가능합니다. 이미 만료된 토큰은 갱신 불가 -> 처음부터 재발급 필요.
    그래서 여유를 두고 "만료 30일 전"에 정기 실행하는 걸 권장합니다.
"""

import base64
import os
import sys

import requests
from nacl import encoding, public


THREADS_REFRESH_URL = "https://graph.threads.net/v1.0/refresh_access_token"
GITHUB_API_BASE = "https://api.github.com"


class TokenRefreshError(Exception):
    pass


def refresh_threads_token(current_token: str) -> dict:
    """Threads 장기 토큰을 갱신합니다. 성공 시 {'access_token':..., 'expires_in':...} 반환."""
    response = requests.get(
        THREADS_REFRESH_URL,
        params={
            "grant_type": "th_refresh_token",
            "access_token": current_token,
        },
        timeout=30,
    )
    if response.status_code != 200:
        raise TokenRefreshError(f"Threads 토큰 갱신 실패: {response.status_code} {response.text}")

    data = response.json()
    if "access_token" not in data:
        raise TokenRefreshError(f"Threads 응답에 access_token이 없습니다: {data}")

    return data


def _get_repo_public_key(repo: str, gh_pat: str) -> dict:
    """저장소의 Actions Secrets 암호화용 공개키를 가져옵니다."""
    url = f"{GITHUB_API_BASE}/repos/{repo}/actions/secrets/public-key"
    headers = {
        "Authorization": f"Bearer {gh_pat}",
        "Accept": "application/vnd.github+json",
    }
    response = requests.get(url, headers=headers, timeout=30)
    if response.status_code != 200:
        raise TokenRefreshError(f"GitHub 공개키 조회 실패: {response.status_code} {response.text}")
    return response.json()


def _encrypt_secret(public_key_b64: str, secret_value: str) -> str:
    """GitHub 공개키(libsodium sealed box)로 시크릿 값을 암호화합니다."""
    public_key = public.PublicKey(public_key_b64.encode("utf-8"), encoding.Base64Encoder())
    sealed_box = public.SealedBox(public_key)
    encrypted = sealed_box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")


def update_github_secret(repo: str, gh_pat: str, secret_name: str, secret_value: str) -> None:
    """GitHub Actions Secret을 새 값으로 덮어씁니다."""
    key_info = _get_repo_public_key(repo, gh_pat)
    encrypted_value = _encrypt_secret(key_info["key"], secret_value)

    url = f"{GITHUB_API_BASE}/repos/{repo}/actions/secrets/{secret_name}"
    headers = {
        "Authorization": f"Bearer {gh_pat}",
        "Accept": "application/vnd.github+json",
    }
    payload = {
        "encrypted_value": encrypted_value,
        "key_id": key_info["key_id"],
    }
    response = requests.put(url, headers=headers, json=payload, timeout=30)
    if response.status_code not in (201, 204):
        raise TokenRefreshError(
            f"GitHub Secret 업데이트 실패: {response.status_code} {response.text}"
        )


def _parse_repo_list(raw: str) -> list:
    """쉼표로 구분된 저장소 목록 문자열을 리스트로 변환합니다."""
    return [r.strip() for r in raw.split(",") if r.strip()]


def main():
    current_token = os.environ.get("THREADS_ACCESS_TOKEN")
    gh_pat = os.environ.get("GH_PAT")

    # GH_REPOSITORIES: 여러 저장소를 쉼표로 구분해서 지정 (예: "a/b,a/c")
    # 지정하지 않으면 GH_REPOSITORY 또는 GitHub Actions 기본 변수 하나만 사용
    repos_raw = os.environ.get("GH_REPOSITORIES")
    single_repo = os.environ.get("GH_REPOSITORY") or os.environ.get("GITHUB_REPOSITORY")
    repos = _parse_repo_list(repos_raw) if repos_raw else ([single_repo] if single_repo else [])

    missing = [
        name
        for name, value in [
            ("THREADS_ACCESS_TOKEN", current_token),
            ("GH_PAT", gh_pat),
        ]
        if not value
    ]
    if not repos:
        missing.append("GH_REPOSITORIES 또는 GH_REPOSITORY/GITHUB_REPOSITORY")
    if missing:
        print(f"❌ 다음 환경변수가 설정되어 있지 않습니다: {', '.join(missing)}")
        sys.exit(1)

    print(f"대상 저장소 ({len(repos)}개): {', '.join(repos)}")

    print("1) Threads 토큰 갱신 시도 중...")
    try:
        result = refresh_threads_token(current_token)
    except TokenRefreshError as e:
        print(f"❌ {e}")
        print(
            "   토큰이 이미 만료되었거나, 발급 후 24시간이 지나지 않았을 수 있습니다. "
            "만료된 경우 콘솔에서 새 토큰을 수동으로 재발급해야 합니다."
        )
        sys.exit(1)

    new_token = result["access_token"]
    expires_in_days = result.get("expires_in", 0) // 86400
    print(f"   갱신 성공. 새 토큰의 남은 유효기간: 약 {expires_in_days}일")

    print("2) GitHub Secret 업데이트 중...")
    failed_repos = []
    for repo in repos:
        try:
            update_github_secret(repo, gh_pat, "THREADS_ACCESS_TOKEN", new_token)
            print(f"   ✅ {repo} — THREADS_ACCESS_TOKEN 갱신 완료")
        except TokenRefreshError as e:
            print(f"   ❌ {repo} — 갱신 실패: {e}")
            failed_repos.append(repo)

    if failed_repos:
        print(f"❌ 일부 저장소에서 갱신 실패: {', '.join(failed_repos)}")
        sys.exit(1)

    print("✅ 모든 저장소의 THREADS_ACCESS_TOKEN Secret이 새 토큰으로 갱신되었습니다.")


if __name__ == "__main__":
    main()
