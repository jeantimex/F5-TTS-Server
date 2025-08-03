#!/bin/bash

# Install python packages
if [ -f "requirements.txt" ]; then
    echo "Installing python packages..."
    pip install -r requirements.txt
else
    echo "requirements.txt not found."
fi

# Create output directory if it doesn't exist
if [ ! -d "output" ]; then
    echo "Creating output directory..."
    mkdir output
fi

# Start the server
echo "Starting server..."
uvicorn api.main:app --host 0.0.0.0 --port 8000
