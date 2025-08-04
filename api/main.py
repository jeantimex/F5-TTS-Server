import subprocess
import logging
import time
import re
import uuid
import threading
from datetime import datetime
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import io
import wave
import tempfile

# Import F5-TTS preprocessing function
try:
    from f5_tts.infer.utils_infer import preprocess_ref_audio_text
    F5_TTS_AVAILABLE = True
    logger_f5 = logging.getLogger("f5_tts_preprocessing")
except ImportError:
    F5_TTS_AVAILABLE = False
    logger_f5 = None

project_root = os.path.dirname(os.path.abspath(os.path.dirname(__file__)))

# Global dictionary to track running TTS processes
running_processes = {}
process_lock = threading.Lock()

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
    remove_silence: bool = False
    randomize_seed: bool = True
    seed: int | None = None
    ref_audio: str = "default/basic_ref_en.wav"
    ref_text: str = ""
    request_id: str | None = None

@app.get("/", response_class=HTMLResponse)
async def read_index():
    try:
        with open("static/tts/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Index file not found")
    except UnicodeDecodeError:
        raise HTTPException(status_code=500, detail="Error reading index file")

@app.get("/conversation", response_class=HTMLResponse)
async def read_conversation():
    try:
        with open("static/conversation/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation interface not found")
    except UnicodeDecodeError:
        raise HTTPException(status_code=500, detail="Error reading conversation interface")

@app.get("/ref-audios/")
async def list_reference_audios():
    """List available reference audio files from both default and custom folders"""
    ref_audios_path = os.path.join(project_root, "ref_audios")
    
    if not os.path.exists(ref_audios_path):
        return {"files": [], "default": "default/basic_ref_en.wav", "ref_texts": {}}
    
    try:
        # Get all audio files from both default and custom directories
        audio_extensions = {'.wav', '.mp3', '.flac', '.m4a', '.ogg'}
        files = []
        ref_texts = {}
        
        # Known reference texts for common files
        known_ref_texts = {
            "default/basic_ref_en.wav": "Some call me nature, others call me mother nature.",
            "default/basic_ref_zh.wav": "对，这就是我，万人敬仰的太乙真人。"
        }
        
        # Scan both default and custom folders
        folders_to_scan = ["default", "custom"]
        
        for folder in folders_to_scan:
            folder_path = os.path.join(ref_audios_path, folder)
            if not os.path.exists(folder_path):
                continue
                
            for filename in os.listdir(folder_path):
                if any(filename.lower().endswith(ext) for ext in audio_extensions):
                    file_path = os.path.join(folder_path, filename)
                    if os.path.isfile(file_path):
                        # Store with folder prefix for identification
                        file_key = f"{folder}/{filename}"
                        files.append(file_key)
                        
                        # Try to find corresponding .txt file first
                        base_name = os.path.splitext(filename)[0]
                        txt_file_path = os.path.join(folder_path, f"{base_name}.txt")
                        
                        if os.path.isfile(txt_file_path):
                            try:
                                with open(txt_file_path, 'r', encoding='utf-8') as f:
                                    ref_texts[file_key] = f.read().strip()
                                    logger.info(f"Loaded reference text from {folder}/{base_name}.txt")
                            except Exception as e:
                                logger.error(f"Error reading {txt_file_path}: {e}")
                                ref_texts[file_key] = known_ref_texts.get(file_key, "")
                        else:
                            # Fall back to known reference texts
                            ref_texts[file_key] = known_ref_texts.get(file_key, "")
        
        files.sort()  # Sort alphabetically
        
        return {
            "files": files,
            "default": "default/basic_ref_en.wav" if "default/basic_ref_en.wav" in files else (files[0] if files else None),
            "ref_texts": ref_texts
        }
    except Exception as e:
        logger.error(f"Error listing reference audio files: {e}")
        return {"files": [], "default": "default/basic_ref_en.wav", "ref_texts": {}}

@app.post("/upload-ref-audio/")
async def upload_reference_audio(file: UploadFile = File(...)):
    """Upload a reference audio file"""
    
    # Validate file type - support multiple formats as per F5-TTS
    allowed_types = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/flac', 'audio/x-m4a', 'audio/ogg']
    allowed_extensions = ['.wav', '.mp3', '.flac', '.m4a', '.ogg']
    
    if file.content_type not in allowed_types:
        # Also check file extension as backup
        file_extension = '.' + file.filename.split('.')[-1].lower() if '.' in file.filename else ''
        if file_extension not in allowed_extensions:
            raise HTTPException(status_code=400, detail="Invalid file type. Only WAV, MP3, FLAC, M4A, and OGG files are allowed.")
    
    # Validate file size (50MB limit)
    max_size = 50 * 1024 * 1024  # 50MB
    file_content = await file.read()
    if len(file_content) > max_size:
        raise HTTPException(status_code=400, detail="File size must be less than 50MB.")
    
    # Sanitize filename
    safe_filename = re.sub(r'[^a-zA-Z0-9._-]', '_', file.filename)
    if not safe_filename or safe_filename.startswith('.'):
        safe_filename = f"uploaded_audio_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{file.filename.split('.')[-1].lower()}"
    
    # Check if file already exists and create unique name if needed
    ref_audios_path = os.path.join(project_root, "ref_audios")
    custom_folder_path = os.path.join(ref_audios_path, "custom")
    os.makedirs(custom_folder_path, exist_ok=True)
    
    final_filename = safe_filename
    counter = 1
    while os.path.exists(os.path.join(custom_folder_path, final_filename)):
        name, ext = os.path.splitext(safe_filename)
        final_filename = f"{name}_{counter}{ext}"
        counter += 1
    
    file_path = os.path.join(custom_folder_path, final_filename)
    
    try:
        # Write file to disk
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)
        
        logger.info(f"Reference audio uploaded successfully: custom/{final_filename}")
        
        return {
            "message": "File uploaded successfully",
            "filename": f"custom/{final_filename}",  # Return with folder prefix
            "size": len(file_content)
        }
        
    except Exception as e:
        logger.error(f"Error saving uploaded file: {e}")
        # Clean up partial file if it exists
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail="Failed to save uploaded file")

@app.post("/upload-text-file/")
async def upload_text_file(file: UploadFile = File(...)):
    """Upload a text file to the ref_audios/custom folder"""
    
    # Validate file type - only .txt files allowed
    if not file.filename.lower().endswith('.txt'):
        raise HTTPException(status_code=400, detail="Invalid file type. Only TXT files are allowed.")
    
    # Validate file size (10MB limit for text files)
    max_size = 10 * 1024 * 1024  # 10MB
    file_content = await file.read()
    if len(file_content) > max_size:
        raise HTTPException(status_code=400, detail="File size must be less than 10MB.")
    
    # Validate that it's actually text content
    try:
        text_content = file_content.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must contain valid UTF-8 text.")
    
    # Sanitize filename
    safe_filename = re.sub(r'[^a-zA-Z0-9._-]', '_', file.filename)
    if not safe_filename or safe_filename.startswith('.'):
        safe_filename = f"uploaded_text_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    
    # Ensure .txt extension
    if not safe_filename.lower().endswith('.txt'):
        safe_filename += '.txt'
    
    # Check if file already exists and create unique name if needed
    ref_audios_path = os.path.join(project_root, "ref_audios")
    custom_folder_path = os.path.join(ref_audios_path, "custom")
    os.makedirs(custom_folder_path, exist_ok=True)
    
    final_filename = safe_filename
    counter = 1
    while os.path.exists(os.path.join(custom_folder_path, final_filename)):
        name, ext = os.path.splitext(safe_filename)
        final_filename = f"{name}_{counter}{ext}"
        counter += 1
    
    file_path = os.path.join(custom_folder_path, final_filename)
    
    try:
        # Write text file to disk
        with open(file_path, "w", encoding="utf-8") as buffer:
            buffer.write(text_content)
        
        logger.info(f"Text file uploaded successfully: custom/{final_filename}")
        
        return {
            "message": "Text file uploaded successfully",
            "filename": final_filename,
            "content": text_content,
            "size": len(file_content)
        }
        
    except Exception as e:
        logger.error(f"Error saving uploaded text file: {e}")
        # Clean up partial file if it exists
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail="Failed to save uploaded text file")

@app.delete("/delete-ref-audio/{file_path:path}")
async def delete_reference_audio(file_path: str):
    """Delete a reference audio file (only allows deleting custom files)"""
    
    # Security check - only allow deleting files from the custom folder
    if not file_path.startswith("custom/"):
        raise HTTPException(status_code=403, detail="Only custom reference audio files can be deleted")
    
    # Build the actual file path
    actual_file_path = os.path.join(project_root, "ref_audios", file_path)
    
    # Security check - ensure the file is within the ref_audios directory
    ref_audios_path = os.path.join(project_root, "ref_audios")
    if not os.path.abspath(actual_file_path).startswith(os.path.abspath(ref_audios_path)):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if file exists
    if not os.path.isfile(actual_file_path):
        raise HTTPException(status_code=404, detail="Reference audio file not found")
    
    # Extract just the filename for extension checking
    filename = os.path.basename(file_path)
    audio_extensions = {'.wav', '.mp3', '.flac', '.m4a', '.ogg'}
    if not any(filename.lower().endswith(ext) for ext in audio_extensions):
        raise HTTPException(status_code=400, detail="Invalid audio file format")
    
    try:
        # Delete the audio file
        os.remove(actual_file_path)
        logger.info(f"Deleted reference audio file: {file_path}")
        
        # Also try to delete the corresponding .txt file if it exists
        base_name = os.path.splitext(filename)[0]
        txt_file_path = os.path.join(os.path.dirname(actual_file_path), f"{base_name}.txt")
        if os.path.isfile(txt_file_path):
            os.remove(txt_file_path)
            logger.info(f"Deleted corresponding text file: custom/{base_name}.txt")
        
        return {
            "message": "Reference audio file deleted successfully",
            "filename": file_path
        }
        
    except Exception as e:
        logger.error(f"Error deleting reference audio file: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete reference audio file")

@app.get("/ref-audios/{file_path:path}")
async def serve_reference_audio(file_path: str):
    """Serve reference audio files from default or custom folders"""
    # Handle both "folder/filename" and just "filename" formats
    if "/" not in file_path:
        # Legacy format - assume it's in the root ref_audios directory (backward compatibility)
        actual_file_path = os.path.join(project_root, "ref_audios", file_path)
    else:
        # New format with folder prefix
        actual_file_path = os.path.join(project_root, "ref_audios", file_path)
    
    # Security check - ensure the file is within the ref_audios directory
    ref_audios_path = os.path.join(project_root, "ref_audios")
    if not os.path.abspath(actual_file_path).startswith(os.path.abspath(ref_audios_path)):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if file exists and is a valid audio file
    if not os.path.isfile(actual_file_path):
        raise HTTPException(status_code=404, detail="Reference audio file not found")
    
    # Extract just the filename for extension checking
    filename = os.path.basename(file_path)
    audio_extensions = {'.wav', '.mp3', '.flac', '.m4a', '.ogg'}
    if not any(filename.lower().endswith(ext) for ext in audio_extensions):
        raise HTTPException(status_code=400, detail="Invalid audio file format")
    
    return FileResponse(actual_file_path, media_type="audio/wav", filename=filename)

@app.post("/tts/")
async def text_to_speech(request: TTSRequest):
    start_time = time.time()
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S-%f")
    
    # Generate or use provided request ID
    request_id = request.request_id or str(uuid.uuid4())
    
    # Log the incoming request
    logger.info(f"TTS Request received - ID: {timestamp}, Request ID: {request_id}")
    logger.info(f"Input text: '{request.gen_text[:100]}{'...' if len(request.gen_text) > 100 else ''}'")
    logger.info(f"Text length: {len(request.gen_text)} characters")
    logger.info(f"Speed setting: {request.speed}x")
    logger.info(f"NFE steps: {request.nfe_steps}")
    logger.info(f"Cross-fade duration: {request.crossfade_duration}s")
    logger.info(f"Remove silence: {request.remove_silence}")
    logger.info(f"Randomize seed: {request.randomize_seed}")
    logger.info(f"Seed: {request.seed if not request.randomize_seed else 'random'}")
    logger.info(f"Reference audio: {request.ref_audio}")
    logger.info(f"Reference text: '{request.ref_text[:50]}{'...' if len(request.ref_text) > 50 else ''}'" if request.ref_text else "Reference text: (auto-transcribe)")
    
    # Handle folder-aware ref audio paths
    ref_audio_path = os.path.join(project_root, "ref_audios", request.ref_audio)
    output_filename = f"{timestamp}.wav"
    output_path = os.path.join("output", output_filename)
    
    logger.info(f"Using reference audio: {ref_audio_path}")
    logger.info(f"Output file: {output_path}")

    # Reference text priority: user textarea > .txt file > F5-TTS preprocessing
    processed_ref_audio = ref_audio_path
    processed_ref_text = request.ref_text.strip()
    
    if processed_ref_text:
        # Priority 1: User provided reference text in textarea
        logger.info("Using user-provided reference text from textarea")
    else:
        # Priority 2: Try to find corresponding .txt file
        # Extract just the filename without folder prefix for .txt file
        if "/" in request.ref_audio:
            folder_path, audio_filename = request.ref_audio.split("/", 1)
            base_name = os.path.splitext(audio_filename)[0]
            txt_file_path = os.path.join(project_root, "ref_audios", folder_path, f"{base_name}.txt")
        else:
            # Legacy format
            base_name = os.path.splitext(request.ref_audio)[0]
            txt_file_path = os.path.join(project_root, "ref_audios", f"{base_name}.txt")
        
        if os.path.isfile(txt_file_path):
            try:
                with open(txt_file_path, 'r', encoding='utf-8') as f:
                    processed_ref_text = f.read().strip()
                logger.info(f"Using reference text from {base_name}.txt file")
            except Exception as e:
                logger.warning(f"Error reading {txt_file_path}: {e}")
                processed_ref_text = ""
        
        # Priority 3: Use F5-TTS preprocessing if no .txt file or reading failed
        if not processed_ref_text and F5_TTS_AVAILABLE:
            try:
                logger.info("No reference text found, using F5-TTS preprocessing to generate it")
                processed_ref_audio, processed_ref_text = preprocess_ref_audio_text(
                    ref_audio_path, 
                    "", 
                    show_info=logger.info
                )
                logger.info(f"F5-TTS generated reference text: '{processed_ref_text[:100]}{'...' if len(processed_ref_text) > 100 else ''}'")
            except Exception as e:
                logger.warning(f"F5-TTS preprocessing failed: {e}, proceeding without reference text")
                processed_ref_text = ""
        elif not processed_ref_text:
            logger.info("No reference text available from any source")

    # Handle seed setting for reproducibility
    if request.randomize_seed:
        # Generate random seed like F5-TTS does
        import numpy as np
        used_seed = np.random.randint(0, 2**31 - 1)
        logger.info(f"Generated random seed: {used_seed}")
    else:
        # Use provided seed, with validation
        if request.seed is None or request.seed < 0 or request.seed > 2**31 - 1:
            logger.warning(f"Invalid seed {request.seed}, using random seed instead")
            import numpy as np
            used_seed = np.random.randint(0, 2**31 - 1)
        else:
            used_seed = request.seed
        logger.info(f"Using specified seed: {used_seed}")
    
    # Set PyTorch seed for reproducibility
    try:
        import torch
        torch.manual_seed(used_seed)
        logger.info(f"Set PyTorch manual seed to: {used_seed}")
    except ImportError:
        logger.warning("PyTorch not available for seed setting")

    command = [
        "f5-tts_infer-cli",
        "--model", "F5TTS_v1_Base",
        "--ref_audio", processed_ref_audio,
        "--gen_text", request.gen_text,
        "-o", "output",
        "-w", output_filename
    ]
    
    # Add reference text if available (either provided or generated)
    if processed_ref_text:
        command.extend(["--ref_text", processed_ref_text])
    
    # Add remove silence flag if enabled
    if request.remove_silence:
        command.append("--remove_silence")
        logger.info("Added --remove_silence flag to F5-TTS command")

    logger.info(f"Executing TTS command: {' '.join(command)}")
    logger.info("Starting TTS generation...")
    
    try:
        # Start the process using Popen so we can track and terminate it
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        # Store the process in our tracking dictionary
        with process_lock:
            running_processes[request_id] = {
                'process': process,
                'timestamp': timestamp,
                'start_time': start_time
            }
        
        logger.info(f"TTS process started with PID: {process.pid}, Request ID: {request_id}")
        
        # Wait for the process to complete
        stdout, stderr = process.communicate()
        
        # Remove from tracking dictionary when done
        with process_lock:
            if request_id in running_processes:
                del running_processes[request_id]
                logger.info(f"Removed completed process {request_id} from tracking")
        
        # Check if process was successful
        if process.returncode != 0:
            logger.error(f"TTS generation failed with return code {process.returncode}")
            logger.error(f"TTS stderr: {stderr}")
            logger.error(f"TTS stdout: {stdout}")
            if process.returncode == -15:  # SIGTERM (process was killed)
                raise HTTPException(status_code=499, detail="TTS generation was cancelled")
            else:
                raise HTTPException(status_code=500, detail=f"Error during TTS generation: {stderr}")
        
        logger.info("TTS generation completed successfully")
        if stdout:
            logger.info(f"TTS stdout: {stdout}")
        if stderr:
            logger.info(f"TTS stderr: {stderr}")
            
    except FileNotFoundError:
        # Clean up tracking if command not found
        with process_lock:
            if request_id in running_processes:
                del running_processes[request_id]
        logger.error("f5-tts_infer-cli command not found")
        raise HTTPException(status_code=500, detail="'f5-tts_infer-cli' not found. Ensure the virtual environment is activated and dependencies are installed correctly.")
    except Exception as e:
        # Clean up tracking on any other exception
        with process_lock:
            if request_id in running_processes:
                del running_processes[request_id]
        raise e

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
        
        # Add generation time and seed to response headers
        headers = {
            "X-Generation-Time": str(generation_time),
            "X-File-Size": str(file_size),
            "X-Used-Seed": str(used_seed),
            "X-Request-ID": request_id
        }
        
        return StreamingResponse(iter_file(), media_type="audio/wav", headers=headers)
    else:
        logger.error(f"Generated audio file not found at {output_path}")
        logger.error(f"Request {timestamp} failed - file not found")
        raise HTTPException(status_code=404, detail="Generated audio file not found. The TTS command may have failed silently.")

@app.post("/cancel-tts/{request_id}")
async def cancel_tts_generation(request_id: str):
    """Cancel a running TTS generation process"""
    
    with process_lock:
        if request_id not in running_processes:
            logger.info(f"Cancel request for {request_id}: Process not found (likely already completed)")
            return {
                "message": "TTS request not found or already completed",
                "request_id": request_id,
                "status": "already_completed"
            }
        
        process_info = running_processes[request_id]
        process = process_info['process']
        
        try:
            # For F5-TTS inference, use immediate force kill since SIGTERM often doesn't work during inference
            process.kill()  # Send SIGKILL directly
            logger.info(f"Force killed TTS process with PID: {process.pid}, Request ID: {request_id}")
            
            # Wait for the process to be fully terminated
            try:
                process.wait(timeout=2)
                logger.info(f"TTS process {process.pid} terminated successfully")
            except subprocess.TimeoutExpired:
                logger.warning(f"TTS process {process.pid} did not terminate within timeout")
            
            # Remove from tracking dictionary
            del running_processes[request_id]
            
            return {
                "message": "TTS generation cancelled successfully",
                "request_id": request_id
            }
            
        except Exception as e:
            logger.error(f"Error cancelling TTS process {request_id}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to cancel TTS generation: {str(e)}")

@app.get("/tts-status/{request_id}")
async def get_tts_status(request_id: str):
    """Get the status of a TTS generation request"""
    
    with process_lock:
        if request_id in running_processes:
            process_info = running_processes[request_id]
            return {
                "status": "running",
                "request_id": request_id,
                "pid": process_info['process'].pid,
                "start_time": process_info['start_time'],
                "timestamp": process_info['timestamp']
            }
        else:
            return {
                "status": "not_found",
                "request_id": request_id
            }
