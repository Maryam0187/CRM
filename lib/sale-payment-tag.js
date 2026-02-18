/**
 * Shared logic for adding the payment-info tag to a sale when payment details are added.
 * Uses tags instead of sale status (payment_info was removed from sales status enum).
 * Use this from all add-payment API routes: cards, banks, cheques-electronic, cheques-mail, payment-emails.
 */

import { Sale, SalesLog } from '../models/index.js';

/**
 * Add 'payment-info' tag to the sale and log the action.
 * @param {number} saleId - Sale ID
 * @param {number} userId - Agent/user ID for the log
 * @param {Object} options - { note: string, cardId?: number, bankId?: number }
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

  await SalesLog.create({
    saleId,
    customerId: sale.customerId,
    agentId: userId || 1,
    action: 'payment_info_added',
    status: sale.status || 'active',
    note: options.note || 'Payment information added',
    cardId: options.cardId ?? undefined,
    bankId: options.bankId ?? undefined,
    timestamp: new Date()
  });
}
