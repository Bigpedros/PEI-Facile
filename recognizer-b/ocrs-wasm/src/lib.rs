use ocrs::{ImageSource, OcrEngine, OcrEngineParams, TextItem};
use rten::Model;
use serde::Serialize;
use wasm_bindgen::prelude::*;

const ALPHABET: &str = " 0123456789!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~€ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

#[derive(Serialize)]
struct WordOut {
    text: String,
    rect: [f32; 4],
}

#[wasm_bindgen]
pub struct OcrsRecognizer {
    engine: OcrEngine,
}

#[wasm_bindgen]
impl OcrsRecognizer {
    #[wasm_bindgen(constructor)]
    pub fn new(detection: &[u8], recognition: &[u8]) -> Result<OcrsRecognizer, JsValue> {
        let detection_model = Model::load(detection.to_vec()).map_err(js_err)?;
        let recognition_model = Model::load(recognition.to_vec()).map_err(js_err)?;
        let engine = OcrEngine::new(OcrEngineParams {
            detection_model: Some(detection_model),
            recognition_model: Some(recognition_model),
            alphabet: Some(ALPHABET.into()),
            ..Default::default()
        }).map_err(js_err)?;
        Ok(OcrsRecognizer { engine })
    }

    pub fn recognize_rgba(&self, pixels: &[u8], width: u32, height: u32) -> Result<String, JsValue> {
        if width == 0 || height == 0 { return Ok("[]".into()); }
        let expected = width as usize * height as usize * 4;
        if pixels.len() != expected { return Err(JsValue::from_str("invalid RGBA buffer length")); }

        let mut rgb = Vec::with_capacity(width as usize * height as usize * 3);
        for px in pixels.chunks_exact(4) { rgb.extend_from_slice(&px[..3]); }

        let source = ImageSource::from_bytes(&rgb, (width, height)).map_err(js_err)?;
        let input = self.engine.prepare_input(source).map_err(js_err)?;
        let found = self.engine.detect_words(&input).map_err(js_err)?;
        let lines = self.engine.find_text_lines(&input, &found);
        let read = self.engine.recognize_text(&input, &lines).map_err(js_err)?;

        let mut words = Vec::new();
        for line in read.into_iter().flatten() {
            for word in line.words() {
                let rect = word.bounding_rect();
                let text = word.to_string();
                if text.trim().is_empty() { continue; }
                words.push(WordOut {
                    text,
                    rect: [rect.left() as f32, rect.top() as f32, rect.right() as f32, rect.bottom() as f32],
                });
            }
        }
        serde_json::to_string(&words).map_err(js_err)
    }
}

fn js_err(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}

