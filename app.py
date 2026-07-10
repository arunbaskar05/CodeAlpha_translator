# app.py
from flask import Flask, render_template, request, jsonify, send_file
from services.translator import translate_text
from gtts import gTTS
import io

app = Flask(__name__)


@app.route('/')
def home():
    """Renders the main page of the translator app."""
    return render_template('index.html')


@app.route('/translate', methods=['POST'])
def translate():
    """
    API endpoint that receives text + language codes from the frontend,
    calls the translation service, and returns the result as JSON.
    """
    data = request.get_json()

    if not data:
        return jsonify({"error": "No data received."}), 400

    text = data.get('text', '')
    source_lang = data.get('source', 'auto')
    target_lang = data.get('target', 'en')

    try:
        translated = translate_text(text, source_lang, target_lang)
        return jsonify({"translatedText": translated}), 200

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400

    except RuntimeError as re:
        return jsonify({"error": str(re)}), 500

    except Exception as e:
        # Final safety net: catches any truly unexpected error we didn't
        # anticipate, so the user always gets a clean JSON error response
        # instead of Flask's raw internal error page (which can leak
        # implementation details and looks unprofessional).
        print(f"Unexpected error in /translate: {e}")
        return jsonify({"error": "An unexpected error occurred. Please try again."}), 500
    

@app.route('/speak', methods=['POST'])
def speak():
    """
    API endpoint that converts text into speech audio (MP3) using gTTS,
    and returns the raw audio data for the browser to play.
    """
    data = request.get_json()

    if not data:
        return jsonify({"error": "No data received."}), 400

    text = data.get('text', '')
    lang = data.get('lang', 'en')

    if not text or not text.strip():
        return jsonify({"error": "No text provided to speak."}), 400

    try:
        # Create the gTTS object: this configures the request but doesn't
        # generate audio yet — that happens on .write_to_fp() below.
        tts = gTTS(text=text, lang=lang)

        # Create an in-memory binary buffer to hold the MP3 data.
        audio_buffer = io.BytesIO()

        # Write the generated MP3 bytes into our in-memory buffer
        # instead of a real file on disk.
        tts.write_to_fp(audio_buffer)

        # After writing, the buffer's internal cursor is at the END of the data.
        # seek(0) rewinds it back to the start, so send_file() reads from
        # the beginning rather than reading nothing.
        audio_buffer.seek(0)

        # send_file() streams the buffer back as the HTTP response,
        # setting the correct Content-Type so the browser knows it's audio.
        return send_file(audio_buffer, mimetype='audio/mpeg')

    except ValueError:
        # gTTS raises ValueError for unsupported language codes.
        return jsonify({"error": f"Text-to-speech not supported for '{lang}'."}), 400

    except Exception as e:
        # Broad catch here is acceptable because gTTS's own exception
        # types aren't well documented/specific — we still log for debugging.
        print(f"TTS error: {e}")
        return jsonify({"error": "Could not generate speech audio."}), 500


if __name__ == '__main__':
    import os
    debug_mode = os.getenv('FLASK_DEBUG', 'True') == 'True'
    app.run(debug=debug_mode)