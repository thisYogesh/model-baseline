import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { CartLinesUpdateEvent } from '@shopify/events';

/**
 * A Subscribe & Save toggle bound to a cart line. Toggling on applies the
 * line's selling plan via `/cart/change.js`; toggling off removes it. The cart
 * drawer re-renders through the theme's standard cart lines update event.
 *
 * Expected data attributes:
 * - `data-line-key`: the cart line item key.
 * - `data-quantity`: the current quantity of the line.
 * - `data-selling-plan-id`: the selling plan ID to apply when toggled on.
 *
 * @typedef {object} Refs
 * @property {HTMLInputElement} toggleInput - The checkbox input element.
 *
 * @extends {Component<Refs>}
 */
class CartSubscriptionToggle extends Component {
  requiredRefs = ['toggleInput'];

  /**
   * Handles the toggle change — bound declaratively via `on:change="/onToggle"`.
   * @param {Event} event
   */
  async onToggle(event) {
    const input = this.refs.toggleInput;
    if (!(event.target instanceof HTMLInputElement)) return;

    const lineKey = this.dataset.lineKey;
    const quantity = Number(this.dataset.quantity || 1);
    const sellingPlanId = Number(this.dataset.sellingPlanId || 0);
    if (!lineKey || !sellingPlanId) return;

    const isChecked = input.checked;
    input.disabled = true;

    const sectionsToUpdate = new Set(['cart-drawer-section']);
    for (const item of document.querySelectorAll('cart-items-component')) {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        sectionsToUpdate.add(item.dataset.sectionId);
      }
    }

    const deferredEventPromise = CartLinesUpdateEvent.createPromise();

    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action: 'update',
        context: 'cart',
        lines: [{ id: lineKey, quantity }],
        promise: deferredEventPromise.promise,
      })
    );

    try {
      const body = JSON.stringify({
        id: lineKey,
        quantity,
        selling_plan: isChecked ? sellingPlanId : null,
        sections: Array.from(sectionsToUpdate).join(','),
        sections_url: window.location.pathname,
      });

      const response = await fetch(Theme.routes.cart_change_url, fetchConfig('json', { body }));
      const data = await response.json();

      if (data.errors) {
        throw new Error(typeof data.errors === 'string' ? data.errors : 'Failed to update subscription');
      }

      deferredEventPromise.resolve({
        cart: CartLinesUpdateEvent.createCartFromAjaxResponse(data),
        detail: {
          sections: data.sections ?? undefined,
          items: data.items,
          itemCount: data.item_count,
          source: 'cart-subscription-toggle',
          didError: false,
        },
      });
    } catch (error) {
      console.error('[cart-subscription-toggle]', error);
      deferredEventPromise.reject(error);

      // Revert the optimistic toggle state on failure.
      input.checked = !isChecked;
      input.disabled = false;
    }
  }
}

if (!customElements.get('cart-subscription-toggle')) {
  customElements.define('cart-subscription-toggle', CartSubscriptionToggle);
}
