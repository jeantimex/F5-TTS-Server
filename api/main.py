import subprocess
from datetime import datetime
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.responses import FileResponse
import os

project_root = os.path.dirname(os.path.abspath(os.path.dirname(__file__)))

app = FastAPI()

class TTSRequest(BaseModel):
    gen_text: str

@app.post("/tts/")
async def text_to_speech(request: TTSRequest):
    ref_audio_path = os.path.join(project_root, "F5-TTS/src/f5_tts/infer/examples/basic/basic_ref_en.wav")
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S-%f")
    output_filename = f"{timestamp}.wav"
    output_path = os.path.join("output", output_filename)

    command = [
        "f5-tts_infer-cli",
        "--model", "F5TTS_v1_Base",
        "--ref_audio", ref_audio_path,
        "--gen_text", request.gen_text,
        "-o", "output",
        "-w", output_filename
    ]

    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Error during TTS generation: {e.stderr}")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="'f5-tts_infer-cli' not found. Ensure the virtual environment is activated and dependencies are installed correctly.")

    if os.path.exists(output_path):
        return FileResponse(output_path, media_type="audio/wav", filename=output_filename)
    else:
        raise HTTPException(status_code=404, detail="Generated audio file not found. The TTS command may have failed silently.")
