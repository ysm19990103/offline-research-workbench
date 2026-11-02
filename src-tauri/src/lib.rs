pub mod core;
#[cfg(feature = "desktop")]
mod desktop;
pub mod reminders;
#[cfg(feature = "desktop")]
pub use desktop::run;
