import subprocess
import logging
import time
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import io
import wave
import tempfile

project_root = os.path.dirname(os.path.abspath(os.path.dirname(__file__)))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('tts_server.log'),
        logging.StreamHandler()  # This will show logs in console too
    ]
)
logger = logging.getLogger(__name__)

def apply_speed_change(input_path, output_path, speed):
    """Apply speed change to audio file using ffmpeg"""
    try:
        command = [
            "ffmpeg", "-i", input_path,
            "-filter:a", f"atempo={speed}",
            "-y", output_path
        ]
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        logger.info(f"Applied speed change {speed}x using ffmpeg")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to apply speed change with ffmpeg: {e.stderr}")
        return False
    except FileNotFoundError:
        logger.warning("ffmpeg not found, speed control not available")
        return False

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.on_event("startup")
async def startup_event():
    logger.info("F5-TTS Server starting up...")
    logger.info(f"Project root: {project_root}")
    logger.info("Server ready to accept TTS requests")

class TTSRequest(BaseModel):
    gen_text: str
    speed: float = 1.0
    nfe_steps: int = 32
    crossfade_duration: float = 0.15
    ref_audio: str = "basic_ref_en.wav"
    ref_text: str = ""

@app.get("/", response_class=HTMLResponse)
async def read_index():
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Index file not found")
    except UnicodeDecodeError:
        raise HTTPException(status_code=500, detail="Error reading index file")

@app.get("/ref-audios/")
async def list_reference_audios():
    """List available reference audio files with their reference text"""
    ref_audios_path = os.path.join(project_root, "ref_audios")
    
    if not os.path.exists(ref_audios_path):
        return {"files": [], "default": "basic_ref_en.wav", "ref_texts": {}}
    
    try:
        # Get all audio files in the ref_audios directory
        audio_extensions = {'.wav', '.mp3', '.flac', '.m4a', '.ogg'}
        files = []
        ref_texts = {}
        
        # Known reference texts for common files
        known_ref_texts = {
            "basic_ref_en.wav": "Some call me nature, others call me mother nature.",
            "basic_ref_zh.wav": "对，这就是我，万人敬仰的太乙真人。"
        }
        
        for filename in os.listdir(ref_audios_path):
            if any(filename.lower().endswith(ext) for ext in audio_extensions):
                file_path = os.path.join(ref_audios_path, filename)
                if os.path.isfile(file_path):
                    files.append(filename)
                    
                    # Try to find corresponding .txt file first
                    base_name = os.path.splitext(filename)[0]
                    txt_file_path = os.path.join(ref_audios_path, f"{base_name}.txt")
                    
                    if os.path.isfile(txt_file_path):
                        try:
                            with open(txt_file_path, 'r', encoding='utf-8') as f:
                                ref_texts[filename] = f.read().strip()
                                logger.info(f"Loaded reference text from {base_name}.txt")
                        except Exception as e:
                            logger.error(f"Error reading {txt_file_path}: {e}")
                            ref_texts[filename] = known_ref_texts.get(filename, "")
                    else:
                        # Fall back to known reference texts
                        ref_texts[filename] = known_ref_texts.get(filename, "")
        
        files.sort()  # Sort alphabetically
        
        return {
            "files": files,
            "default": "basic_ref_en.wav" if "basic_ref_en.wav" in files else (files[0] if files else None),
            "ref_texts": ref_texts
        }
    except Exception as e:
        logger.error(f"Error listing reference audio files: {e}")
        return {"files": [], "default": "basic_ref_en.wav", "ref_texts": {}}

@app.post("/tts/")
async def text_to_speech(request: TTSRequest):
    start_time = time.time()
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S-%f")
    
    # Log the incoming request
    logger.info(f"TTS Request received - ID: {timestamp}")
    logger.info(f"Input text: '{request.gen_text[:100]}{'...' if len(request.gen_text) > 100 else ''}'")
    logger.info(f"Text length: {len(request.gen_text)} characters")
    logger.info(f"Speed setting: {request.speed}x")
    logger.info(f"NFE steps: {request.nfe_steps}")
    logger.info(f"Cross-fade duration: {request.crossfade_duration}s")
    logger.info(f"Reference audio: {request.ref_audio}")
    logger.info(f"Reference text: '{request.ref_text[:50]}{'...' if len(request.ref_text) > 50 else ''}'" if request.ref_text else "Reference text: (auto-transcribe)")
    
    ref_audio_path = os.path.join(project_root, "ref_audios", request.ref_audio)
    output_filename = f"{timestamp}.wav"
    output_path = os.path.join("output", output_filename)
    
    logger.info(f"Using reference audio: {ref_audio_path}")
    logger.info(f"Output file: {output_path}")

    command = [
        "f5-tts_infer-cli",
        "--model", "F5TTS_v1_Base",
        "--ref_audio", ref_audio_path,
        "--gen_text", request.gen_text,
        "-o", "output",
        "-w", output_filename
    ]
    
    # Add reference text if provided
    if request.ref_text.strip():
        command.extend(["--ref_text", request.ref_text])

    logger.info(f"Executing TTS command: {' '.join(command)}")
    logger.info("Starting TTS generation...")
    
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        logger.info("TTS generation completed successfully")
        if result.stdout:
            logger.info(f"TTS stdout: {result.stdout}")
        if result.stderr:
            logger.info(f"TTS stderr: {result.stderr}")
    except subprocess.CalledProcessError as e:
        logger.error(f"TTS generation failed with return code {e.returncode}")
        logger.error(f"TTS stderr: {e.stderr}")
        logger.error(f"TTS stdout: {e.stdout}")
        raise HTTPException(status_code=500, detail=f"Error during TTS generation: {e.stderr}")
    except FileNotFoundError:
        logger.error("f5-tts_infer-cli command not found")
        raise HTTPException(status_code=500, detail="'f5-tts_infer-cli' not found. Ensure the virtual environment is activated and dependencies are installed correctly.")

    if os.path.exists(output_path):
        final_output_path = output_path
        
        # Apply speed change if needed
        if request.speed != 1.0:
            logger.info(f"Applying speed change: {request.speed}x")
            speed_output_path = os.path.join("output", f"{timestamp}_speed_{request.speed}.wav")
            
            if apply_speed_change(output_path, speed_output_path, request.speed):
                final_output_path = speed_output_path
                logger.info(f"Speed change applied successfully")
            else:
                logger.warning(f"Speed change failed, using original audio")
        
        # Log file details
        file_size = os.path.getsize(final_output_path)
        generation_time = time.time() - start_time
        
        logger.info(f"Audio file generated successfully")
        logger.info(f"File size: {file_size} bytes ({file_size/1024:.1f} KB)")
        logger.info(f"Generation time: {generation_time:.2f} seconds")
        logger.info(f"Request {timestamp} completed successfully")
        
        def iter_file():
            with open(final_output_path, "rb") as file_like:
                yield from file_like
        
        # Add generation time to response headers
        headers = {
            "X-Generation-Time": str(generation_time),
            "X-File-Size": str(file_size)
        }
        
        return StreamingResponse(iter_file(), media_type="audio/wav", headers=headers)
    else:
        logger.error(f"Generated audio file not found at {output_path}")
        logger.error(f"Request {timestamp} failed - file not found")
        raise HTTPException(status_code=404, detail="Generated audio file not found. The TTS command may have failed silently.")
