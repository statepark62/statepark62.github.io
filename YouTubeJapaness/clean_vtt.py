"""
2단계: 다운로드한 .vtt 자막 파일에서 타임스탬프/중복 줄을 제거하고
      순수 일본어 텍스트만 뽑아낸다.
"""
from pathlib import Path
import webvtt


def vtt_to_clean_text(vtt_path: Path) -> str:
    """VTT 파일을 읽어 중복 없는 순서의 순수 텍스트로 변환."""
    lines: list[str] = []
    prev = None
    for caption in webvtt.read(str(vtt_path)):
        text = caption.text.strip().replace("\n", " ")
        if not text or text == prev:
            # 자동자막은 같은 줄이 여러 캡션에 걸쳐 반복되는 경우가 많아 중복 제거
            continue
        lines.append(text)
        prev = text
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    path = Path(sys.argv[1])
    print(vtt_to_clean_text(path))
