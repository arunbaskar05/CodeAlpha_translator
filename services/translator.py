# services/translator.py
# Handles all communication with the MyMemory Translation API.
# Kept separate from app.py so app.py never needs to know HOW translation works —
# only that translate_text() exists and returns a string.

import os
import requests
from dotenv import load_dotenv

load_dotenv()

API_URL = "https://api.mymemory.translated.net/get"

# Optional: including an email raises MyMemory's daily rate limit.
# Safe to leave blank in .env — requests still work without it.
CONTACT_EMAIL = os.getenv("MYMEMORY_EMAIL", "")


def translate_text(text, source_lang, target_lang):
    """
    Sends text to the MyMemory API and returns the translated result.

    Parameters:
        text (str): The text the user wants translated.
        source_lang (str): Language code of the input text (e.g. 'en').
        target_lang (str): Language code to translate into (e.g. 'hi').

    Returns:
        str: The translated text.

    Raises:
        ValueError: If the input text is empty.
        RuntimeError: If the API call fails or returns an unexpected response.
    """

    if not text or not text.strip():
        raise ValueError("Text to translate cannot be empty.")

    # MyMemory doesn't support "auto" as a source language like LibreTranslate did.
    # If the user picked "Detect Language" in the dropdown, we fall back to English
    # as a reasonable default rather than sending an invalid language code.
    if source_lang == "auto":
        source_lang = "en"

    # MyMemory expects the language pair as a single string: "en|hi"
    lang_pair = f"{source_lang}|{target_lang}"

    # Query parameters for a GET request go in a dict passed to 'params',
    # NOT in the URL string itself — requests builds the correct URL for us,
    # handling things like spaces and special characters (URL encoding) automatically.
    params = {
        "q": text,
        "langpair": lang_pair
    }

    # Only attach the email if the user configured one.
    if CONTACT_EMAIL:
        params["de"] = CONTACT_EMAIL

    try:
        # Note: requests.get(), not requests.post() — matches MyMemory's API design.
        response = requests.get(API_URL, params=params, timeout=10)
        response.raise_for_status()

        data = response.json()

        # Defensive checks: confirm the nested structure exists before we dig into it.
        # This guards against MyMemory changing their response format unexpectedly.
        if "responseData" not in data or "translatedText" not in data["responseData"]:
            raise RuntimeError("Unexpected response format from translation API.")

        translated = data["responseData"]["translatedText"]
        match_score = data["responseData"].get("match", 0)  # confidence score, 0 to 1

        if "MYMEMORY WARNING" in translated.upper():
            raise RuntimeError("Translation quota exceeded. Please try again later.")

        # MyMemory sometimes returns loosely related results for very short or
        # generic phrases, since it searches a database of past translations
        # rather than generating new ones. A low match score signals low confidence.
        # We still return the result (better than nothing), but this is worth
        # knowing about as you test — longer, more specific sentences tend to
        # produce far more reliable matches than single common words.
        if match_score < 0.5:
            print(f"⚠️ Low confidence match ({match_score}) for: '{text}'")

        return translated

    except requests.exceptions.Timeout:
        raise RuntimeError("Translation service timed out. Please try again.")

    except requests.exceptions.ConnectionError:
        raise RuntimeError("Could not connect to the translation service.")

    except requests.exceptions.HTTPError as http_err:
        raise RuntimeError(f"Translation service returned an error: {http_err}")