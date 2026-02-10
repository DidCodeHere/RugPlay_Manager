//! Trade queue and executor

use rugplay_core::{Result, TradeResponse, TradeType};
use rugplay_networking::RugplayClient;
use std::collections::VecDeque;
use tokio::sync::mpsc;
use tracing::{error, info};

/// A trade order in the queue
#[derive(Debug, Clone)]
pub struct TradeOrder {
    pub symbol: String,
    pub trade_type: TradeType,
    pub amount: f64,
    pub priority: TradePriority,
}

/// Trade priority levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum TradePriority {
    /// Normal trades
    Normal = 0,
    /// High priority (e.g., stop loss)
    High = 1,
    /// Critical priority (e.g., emergency exit, moonbag)
    Critical = 2,
}

/// Manages trade execution queue
#[allow(dead_code)]
pub struct TradeExecutor {
    queue: VecDeque<TradeOrder>,
    tx: Option<mpsc::Sender<TradeOrder>>,
}

impl TradeExecutor {
    pub fn new() -> Self {
        Self {
            queue: VecDeque::new(),
            tx: None,
        }
    }

    /// Queue a trade order
    pub fn queue_trade(&mut self, order: TradeOrder) {
        // Insert based on priority
        let pos = self
            .queue
            .iter()
            .position(|o| o.priority < order.priority)
            .unwrap_or(self.queue.len());
        
        self.queue.insert(pos, order);
    }

    /// Get the next trade to execute
    pub fn next_trade(&mut self) -> Option<TradeOrder> {
        self.queue.pop_front()
    }

    /// Execute a single trade
    pub async fn execute_trade(
        client: &RugplayClient,
        order: &TradeOrder,
    ) -> Result<TradeResponse> {
        info!(
            "Executing {:?} trade: {} {} of {}",
            order.priority, order.trade_type as u8, order.amount, order.symbol
        );

        let request = rugplay_core::TradeRequest {
            trade_type: order.trade_type,
            amount: order.amount,
        };

        let response = client.trade(&order.symbol, request).await;

        match &response {
            Ok(r) => info!(
                "Trade executed: {} @ ${}, impact {}%",
                order.symbol, r.new_price, r.price_impact * 100.0
            ),
            Err(e) => error!("Trade failed for {}: {}", order.symbol, e),
        }

        response
    }

    /// Queue length
    pub fn queue_len(&self) -> usize {
        self.queue.len()
    }

    /// Clear all pending trades
    pub fn clear_queue(&mut self) {
        self.queue.clear();
    }
}

impl Default for TradeExecutor {
    fn default() -> Self {
        Self::new()
    }
}
