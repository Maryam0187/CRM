/**
 * Shared logic for adding the payment-info tag to a sale when payment details are added.
 * Uses tags instead of sale status (payment_info was removed from sales status enum).
 * Use this from all add-payment API routes: cards, banks, cheques-electronic, cheques-mail, payment-emails.
 * The sales log entry (e.g. "Payment added with card") is created by the frontend after a successful add.
 */

import { Sale } from '../models/index.js';

/**
 * Add 'payment-info' tag to the sale. Log entry is created by the frontend.
 * @param {number} saleId - Sale ID
 * @param {number} userId - Agent/user ID (unused; kept for API compatibility)
 * @param {Object} options - { cardId?: number, bankId?: number }
 * @returns {Promise<void>}
 */
export async function addPaymentInfoTagToSale(saleId, userId, options = {}) {
  if (!saleId) return;
  const sale = await Sale.findByPk(saleId);
  if (!sale) return;

  const tags = Array.isArray(sale.tags) ? [...sale.tags] : [];
  if (!tags.includes('payment-info')) {
    tags.push('payment-info');
    await Sale.update({ tags }, { where: { id: saleId } });
  }
}
