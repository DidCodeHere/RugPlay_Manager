//! High-level API wrappers for Rugplay endpoints
//! 
//! This module provides convenient wrappers around the raw HTTP client,
//! adding business logic like validation and data transformation.

mod trading;
mod user;

pub use trading::*;
pub use user::*;
