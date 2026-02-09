//! AES-256-GCM encryption for session tokens
//!
//! Supports machine-bound key derivation via Argon2id + machine fingerprint.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use rand::RngCore;
use rugplay_core::{Error, Result};

/// Encrypted token with IV for decryption
#[derive(Debug, Clone)]
pub struct EncryptedToken {
    pub ciphertext: Vec<u8>,
    pub iv: [u8; 12],
}

/// Handles AES-256-GCM encryption/decryption of session tokens
pub struct TokenEncryptor {
    cipher: Aes256Gcm,
}

impl TokenEncryptor {
    /// Create a new encryptor from a 32-byte key
    /// 
    /// # Arguments
    /// * `key` - Must be exactly 32 bytes for AES-256
    pub fn new(key: &[u8]) -> Result<Self> {
        if key.len() != 32 {
            return Err(Error::EncryptionError(format!(
                "Key must be 32 bytes, got {}",
                key.len()
            )));
        }

        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|e| Error::EncryptionError(e.to_string()))?;

        Ok(Self { cipher })
    }

    /// Create encryptor from a password (derives 32-byte key via Argon2id)
    pub fn from_password(password: &str) -> Result<Self> {
        let key = derive_key_from_password(password, b"rugplay-salt-v1")?;
        Self::new(&key)
    }

    /// Encrypt a plaintext token
    /// 
    /// Generates a random IV for each encryption operation
    pub fn encrypt(&self, plaintext: &str) -> Result<EncryptedToken> {
        // Generate random 12-byte IV (nonce)
        let mut iv = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut iv);
        let nonce = Nonce::from_slice(&iv);

        // Encrypt
        let ciphertext = self
            .cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| Error::EncryptionError(e.to_string()))?;

        Ok(EncryptedToken { ciphertext, iv })
    }

    /// Decrypt an encrypted token
    pub fn decrypt(&self, encrypted: &EncryptedToken) -> Result<String> {
        let nonce = Nonce::from_slice(&encrypted.iv);

        let plaintext = self
            .cipher
            .decrypt(nonce, encrypted.ciphertext.as_ref())
            .map_err(|e| Error::EncryptionError(e.to_string()))?;

        String::from_utf8(plaintext)
            .map_err(|e| Error::EncryptionError(e.to_string()))
    }
}

// ─── Machine-bound key derivation ────────────────────────────────────

/// Derive a 32-byte AES key from a password/passphrase using Argon2id
fn derive_key_from_password(password: &str, salt: &[u8]) -> Result<[u8; 32]> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| Error::EncryptionError(format!("Argon2 key derivation failed: {}", e)))?;
    Ok(key)
}

/// Get a machine-unique fingerprint string.
///
/// Combines the machine-uid crate (returns a hardware ID on Windows)
/// with the COMPUTERNAME environment variable as fallback entropy.
pub fn get_machine_fingerprint() -> String {
    let machine_id = machine_uid::get()
        .unwrap_or_else(|_| "fallback-no-machine-id".to_string());

    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown-host".to_string());

    format!("rugplay-{}-{}", machine_id, hostname)
}

/// Derive a 32-byte AES encryption key that is bound to this machine.
///
/// Uses `machine-uid` + hostname as the "password" input and a
/// fixed application-specific salt. The key will be the same on
/// every call on the same machine, but different on another machine.
pub fn derive_machine_key() -> Result<[u8; 32]> {
    let fingerprint = get_machine_fingerprint();
    let salt = b"rugplay-bot-v1-machine-salt";
    derive_key_from_password(&fingerprint, salt)
}

/// The legacy encryption key used before machine-bound key derivation.
/// Tokens encrypted with this key need to be migrated to the new key.
pub const LEGACY_KEY: [u8; 32] = [0u8; 32];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let encryptor = TokenEncryptor::from_password("test_password_123").unwrap();
        let original = "aBcDeFgHiJkLmNoPqRsTuVwXyZ012345.AbCdEfGhIjKlMnOpQrStUvWxYz789AbCdEfGhIjKlMn0%3D";

        let encrypted = encryptor.encrypt(original).unwrap();
        let decrypted = encryptor.decrypt(&encrypted).unwrap();

        assert_eq!(original, decrypted);
    }

    #[test]
    fn test_unique_iv_per_encryption() {
        let encryptor = TokenEncryptor::from_password("test_password").unwrap();
        let token = "test_token";

        let encrypted1 = encryptor.encrypt(token).unwrap();
        let encrypted2 = encryptor.encrypt(token).unwrap();

        // IVs should be different
        assert_ne!(encrypted1.iv, encrypted2.iv);
        // Ciphertexts should also differ due to different IVs
        assert_ne!(encrypted1.ciphertext, encrypted2.ciphertext);
    }

    #[test]
    fn test_wrong_key_fails() {
        let encryptor1 = TokenEncryptor::from_password("password1").unwrap();
        let encryptor2 = TokenEncryptor::from_password("password2").unwrap();

        let encrypted = encryptor1.encrypt("secret_token").unwrap();
        let result = encryptor2.decrypt(&encrypted);

        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_key_length() {
        let short_key = [0u8; 16]; // Only 16 bytes, need 32
        let result = TokenEncryptor::new(&short_key);
        assert!(result.is_err());
    }

    #[test]
    fn test_derive_machine_key() {
        let key1 = derive_machine_key().unwrap();
        let key2 = derive_machine_key().unwrap();
        // Same machine should produce same key
        assert_eq!(key1, key2);
        // Should be 32 bytes
        assert_eq!(key1.len(), 32);
        // Should not be all zeros
        assert!(key1.iter().any(|&b| b != 0));
    }

    #[test]
    fn test_machine_key_encryptor() {
        let key = derive_machine_key().unwrap();
        let encryptor = TokenEncryptor::new(&key).unwrap();
        
        let original = "test_session_token_value";
        let encrypted = encryptor.encrypt(original).unwrap();
        let decrypted = encryptor.decrypt(&encrypted).unwrap();
        
        assert_eq!(original, decrypted);
    }
}
