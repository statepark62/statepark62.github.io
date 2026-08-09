"""
3단계: 정제된 대본 텍스트에서 교과서에 잘 안 나오는
      생활 회화 표현을 GPT-5로 추출해 구조화된 JSON으로 받는다.
"""
import json
from openai import OpenAI

import config

client = OpenAI(api_key=config.OPENAI_API_KEY)

SYSTEM_PROMPT = """당신은 일본어 교육 전문가입니다.
주어진 일본어 팟캐스트 대본에서, 한국인 일본어 학습자가 교과서에서는
잘 배우지 못하는 '생활 회화 표현'만 골라 추출하세요.

선정 기준:
- 구어체 축약형(예: てる→てる, じゃない→じゃん 등), 맞장구, 감탄사,
  관용구, 유행어, 방언 등 실제 대화에서 자주 쓰이지만 교과서엔 안 나오는 표현
- 단순 단어보다는 표현/문형 단위 (예: "〜ってわけ", "地味に" 등)
- 대본에 실제로 등장한 표현만 (지어내지 말 것)
- 한 대본당 최대 8개, 너무 흔한 기초 표현은 제외

반드시 아래 JSON 배열 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.
[
  {
    "expression": "일본어 표현",
    "meaning_ko": "한국어 의미 설명",
    "example_sentence": "대본에서 실제 쓰인 문장 (자연스럽게 다듬어도 됨, 표현이 잘 드러나게)",
    "nuance_note": "언제/어떤 뉘앙스로 쓰는지 한 줄 설명"
  }
]
"""


def extract(video_title: str, clean_text: str) -> list[dict]:
    if not clean_text.strip():
        return []

    user_prompt = f"영상 제목: {video_title}\n\n대본:\n{clean_text}"

    response = client.chat.completions.create(
        model=config.EXTRACTION_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"} if False else None,
    )

    content = response.choices[0].message.content.strip()
    # 모델이 코드블록으로 감싸는 경우 대비
    if content.startswith("```"):
        content = content.strip("`")
        content = content.split("\n", 1)[1] if "\n" in content else content
        if content.endswith("json"):
            content = content[:-4]

    try:
        data = json.loads(content)
        if isinstance(data, dict) and "expressions" in data:
            data = data["expressions"]
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        print("⚠️ JSON 파싱 실패, 원본 응답:\n", content)
        return []
