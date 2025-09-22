# MindSpace - AI Mental Health Coach

Welcome to **MindSpace**, an AI-powered mental health coach designed to provide accessible, 24/7 support through natural voice and text conversations. This project was developed by the Back Propagators for the Christ University Hackathon 2025.

**Live Demo:** [aydie.in/hackathon/ai-therapist](https://aydie.in/hackathon/ai-therapist)

---

## The Problem

Mental health support is often inaccessible, expensive, and impersonal. Many individuals who need immediate help face barriers such as cost, availability, or the stigma associated with traditional therapy.

---

## Our Solution

MindSpace is an AI-powered mental health coach that offers a safe and confidential space for users to express themselves. Our AI provides continuous support through both text and voice, making mental health care more approachable and readily available.

---

## Key Features

- **Natural Voice Interaction:** Speak naturally and receive empathetic, spoken responses.
- **Text-Based Chat:** Engage in thoughtful, written conversations with a complete session history.
- **24/7 Availability:** Access immediate mental health support anytime, anywhere.
- **Privacy-Focused:** Utilizes local processing for speech-to-text to ensure user privacy.
- **Personalized Experience:** The AI adapts its responses to provide personalized support.

---

## Tech Stack

Our project is built with a modern stack to ensure a robust and responsive experience:

- **Backend:** Python, Flask
- **AI & Machine Learning:**
  - Text Generation: Google Gemini API
  - Speech-to-Text: OpenAI Whisper
  - Text-to-Speech: Murf.ai API
- **Frontend:** HTML, CSS, JavaScript

---

## System Architecture

The application follows a simple yet powerful architecture to process user interactions seamlessly.

### Text Message Workflow

1. **User Input:** The user sends a POST request with their text message.
2. **Backend Processing:** The Flask endpoint receives the request.
3. **AI Response Generation:** The text is sent directly to the Gemini API, which processes the message and generates an empathetic response.
4. **Output:** The AI-generated text response is returned to the user.

### Audio Message Workflow

1. **User Input:** The user records audio, which is sent via a POST request to the backend.
2. **Speech-to-Text:** The audio file is processed by a local OpenAI Whisper model for accurate transcription.
3. **AI Response Generation:** The transcribed text is sent to the Gemini API to generate a contextual response.
4. **Text-to-Speech:** The AI's text response is converted to a natural-sounding audio file using the Murf.ai API.
5. **Output:** The final audio response and the transcribed text are returned to the user.

---

## Project Structure

The repository is organized as follows:

```
/
├── .gitignore
├── LICENSE
├── README.md
├── api_documentation.md
├── app.py
├── requirements.txt
├── setup.py
├── test.py
├── index.html
├── assets/
│   ├── ai.js
│   └── main.css
├── backend/
│   ├── conversation.py
│   ├── gemini_client.py
│   ├── orchastrator.py
│   ├── speech_to_text.py
│   ├── system_instruction.py
│   └── text_to_speech.py
└── audios/
    └── (This directory is for storing user and AI-generated audio files)
```

---

## Getting Started

Follow these steps to set up and run the project locally.

### Prerequisites

- Ensure you have Python 3.10 or higher installed on your system.

### Installation

1. **Clone the repository:**
    ```bash
    git clone https://github.com/aydiegithub/hackathon-ai-mental-health-coach.git
    cd hackathon-ai-mental-health-coach
    ```

2. **Create a virtual environment:**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    ```

3. **Install the required dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4. **Set up your API keys:**
    - Create a `.env` file in the root directory and add your API keys:
      ```
      GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
      MURF_API_KEY="YOUR_MURF_API_KEY"
      ```

### Running the Application

- **Start the Flask server:**
    ```bash
    python app.py
    ```
    The backend server will start on [http://localhost:5001](http://localhost:5001).

- **Open the frontend:**
    - Open the `index.html` file in your web browser to start interacting with the AI Mental Health Coach.

---

## API Usage

The core functionality is handled by a single API endpoint.

### `POST /chat`

This endpoint processes both text and audio messages.

**Request Body:**

| Field         | Type   | Required | Description                                                                   |
|---------------|--------|----------|-------------------------------------------------------------------------------|
| user_message  | string | Yes      | For text, this is the user's message. For audio, it's the file path to the audio file on the server. |
| dtype         | string | Yes      | `"message"` for a text input, `"audio"` for an audio file.                    |

**Success Response (for Audio):**

```json
{
  "content": "I hear that things have been overwhelming for you. It takes courage to share that. Can you tell me more about what's been on your mind?",
  "audio_filepath": "audios/ai_response.mp3",
  "transcribed_text": "I've been feeling really overwhelmed lately.",
  "type": "audio"
}
```

---

## Frontend Integration Example

Here is how you can interact with the API from a JavaScript frontend.

### Sending a Text Message

```js
fetch("http://localhost:5001/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    user_message: "I feel stressed and anxious.",
    dtype: "message"
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

### Sending an Audio Message

> **Note:** The audio file must first be uploaded to the server.

```js
fetch("http://localhost:5001/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    user_message: "audios/user_audio.mp3", // File path on the server
    dtype: "audio"
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

---

## License

This project is licensed under the Apache License 2.0. See the LICENSE file for details.

---

## Team

This project was created with care by **Back Propagators**.
