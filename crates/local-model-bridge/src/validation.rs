use serde::de::{self, IgnoredAny, MapAccess, Visitor};
use serde::{Deserialize, Deserializer};
use std::fmt;

struct SelectedModel(String);
impl<'de> Deserialize<'de> for SelectedModel {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct ModelVisitor;
        impl<'de> Visitor<'de> for ModelVisitor {
            type Value = SelectedModel;
            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a chat request object with one model")
            }
            fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
                let mut model = None;
                while let Some(key) = map.next_key::<String>()? {
                    if key == "model" {
                        if model.is_some() {
                            return Err(de::Error::duplicate_field("model"));
                        }
                        model = Some(map.next_value::<String>()?);
                    } else {
                        map.next_value::<IgnoredAny>()?;
                    }
                }
                model
                    .map(SelectedModel)
                    .ok_or_else(|| de::Error::missing_field("model"))
            }
        }
        deserializer.deserialize_map(ModelVisitor)
    }
}
pub(crate) fn chat_model(body: &[u8], model: &str) -> Result<(), &'static str> {
    let selected: SelectedModel = serde_json::from_slice(body).map_err(|_| "invalid_request")?;
    if selected.0 == model {
        Ok(())
    } else {
        Err("invalid_request")
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_duplicate_model_parser_differences_and_malformed_json() {
        assert!(chat_model(br#"{"model":"foreign","model":"selected"}"#, "selected").is_err());
        assert!(chat_model(br#"{"model":"selected","messages": [}"#, "selected").is_err());
        assert!(chat_model(br#"{"model":"selected","messages":[]}"#, "selected").is_ok());
    }
}
