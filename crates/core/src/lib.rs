//! Rugplay Core - Shared data models, types, and errors

pub mod errors;
pub mod models;
pub mod types;

pub use errors::{Error, Result};
pub use models::*;
pub use types::*;
