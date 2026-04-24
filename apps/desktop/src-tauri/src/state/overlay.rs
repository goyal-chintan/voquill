use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Mutex;

use crate::domain::{OverlayPhase, PillWindowSize};

const PHASE_IDLE: u8 = 0;
const PHASE_RECORDING: u8 = 1;
const PHASE_LOADING: u8 = 2;

const SIZE_DICTATION: u8 = 0;
const SIZE_ASSISTANT_COMPACT: u8 = 1;
const SIZE_ASSISTANT_EXPANDED: u8 = 2;
const SIZE_ASSISTANT_TYPING: u8 = 3;

pub struct OverlayState {
    phase: AtomicU8,
    pill_window_size: AtomicU8,
    audio_levels: Mutex<Vec<f32>>,
    /// Set when the overlay transitions from recording/loading → idle.
    /// Consumed (cleared) by the RunEvent::Reopen handler to suppress one
    /// focus-steal that macOS can trigger when the pill overlay hides.
    suppress_reopen: AtomicBool,
}

impl Default for OverlayState {
    fn default() -> Self {
        Self::new()
    }
}

impl OverlayState {
    pub fn new() -> Self {
        Self {
            phase: AtomicU8::new(PHASE_IDLE),
            pill_window_size: AtomicU8::new(SIZE_DICTATION),
            audio_levels: Mutex::new(Vec::new()),
            suppress_reopen: AtomicBool::new(false),
        }
    }

    pub fn set_audio_levels(&self, levels: Vec<f32>) {
        if let Ok(mut guard) = self.audio_levels.lock() {
            *guard = levels;
        }
    }

    pub fn take_audio_levels(&self) -> Vec<f32> {
        if let Ok(mut guard) = self.audio_levels.lock() {
            std::mem::take(&mut *guard)
        } else {
            Vec::new()
        }
    }

    pub fn set_phase(&self, phase: &OverlayPhase) {
        let prev = self.phase.load(Ordering::Relaxed);
        let value = match phase {
            OverlayPhase::Idle => PHASE_IDLE,
            OverlayPhase::Recording => PHASE_RECORDING,
            OverlayPhase::Loading => PHASE_LOADING,
        };
        self.phase.store(value, Ordering::Relaxed);

        // When transitioning from recording/loading → idle, suppress the next
        // RunEvent::Reopen so the main window doesn't steal focus from the
        // target app right after dictation completes.
        if value == PHASE_IDLE && (prev == PHASE_RECORDING || prev == PHASE_LOADING) {
            self.suppress_reopen.store(true, Ordering::Relaxed);
        }
    }

    pub fn get_phase(&self) -> OverlayPhase {
        match self.phase.load(Ordering::Relaxed) {
            PHASE_RECORDING => OverlayPhase::Recording,
            PHASE_LOADING => OverlayPhase::Loading,
            _ => OverlayPhase::Idle,
        }
    }

    pub fn is_idle(&self) -> bool {
        self.phase.load(Ordering::Relaxed) == PHASE_IDLE
    }

    pub fn set_pill_window_size(&self, size: PillWindowSize) {
        let value = match size {
            PillWindowSize::Dictation => SIZE_DICTATION,
            PillWindowSize::AssistantCompact => SIZE_ASSISTANT_COMPACT,
            PillWindowSize::AssistantExpanded => SIZE_ASSISTANT_EXPANDED,
            PillWindowSize::AssistantTyping => SIZE_ASSISTANT_TYPING,
        };
        self.pill_window_size.store(value, Ordering::Relaxed);
    }

    pub fn get_pill_window_size(&self) -> PillWindowSize {
        match self.pill_window_size.load(Ordering::Relaxed) {
            SIZE_ASSISTANT_COMPACT => PillWindowSize::AssistantCompact,
            SIZE_ASSISTANT_EXPANDED => PillWindowSize::AssistantExpanded,
            SIZE_ASSISTANT_TYPING => PillWindowSize::AssistantTyping,
            _ => PillWindowSize::Dictation,
        }
    }

    pub fn is_assistant_mode(&self) -> bool {
        self.pill_window_size.load(Ordering::Relaxed) != SIZE_DICTATION
    }

    /// Returns `true` (once) if a recording/loading → idle transition happened
    /// since the last call.  The flag is atomically cleared.
    pub fn take_suppress_reopen(&self) -> bool {
        self.suppress_reopen.swap(false, Ordering::Relaxed)
    }
}
