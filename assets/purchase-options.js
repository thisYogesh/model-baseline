import { Component } from '@theme/component';

/**
 * Purchase options selector that toggles between a subscription
 * (Subscribe & Save) and a one-time purchase.
 *
 * Responsibilities:
 * - Toggles the selected state styling between the two option cards.
 * - Enables the `selling_plan` select (associated with the buy-buttons
 *   product form via the `form` attribute) when the subscription option is
 *   active, and disables it for one-time purchases so no selling plan is
 *   submitted.
 * - Updates the add-to-cart button label with the active option's price
 *   (e.g. "Add to Cart | $26.00").
 *
 * Host data attributes:
 * - `data-form-id` — id of the buy-buttons product form.
 * - `data-subscribe-price` — formatted subscription price.
 * - `data-onetime-price` — formatted one-time price.
 *
 * @typedef {object} Refs
 * @property {HTMLInputElement} [subscribeRadio] - Subscription radio input.
 * @property {HTMLInputElement} [onetimeRadio] - One-time purchase radio input.
 * @property {HTMLElement} [subscribeCard] - Subscription card element.
 * @property {HTMLElement} [onetimeCard] - One-time purchase card element.
 * @property {HTMLSelectElement} [sellingPlanSelect] - Selling plan frequency select.
 *
 * @extends {Component<Refs>}
 */
class PurchaseOptionsComponent extends Component {
  /** @type {string | null} */
  #originalButtonLabel = null;

  connectedCallback() {
    super.connectedCallback();
    this.#syncState();
  }

  /**
   * Handles a purchase option radio change or selling plan change.
   */
  handleOptionChange() {
    this.#syncState();

    this.dispatchEvent(
      new CustomEvent('purchase-options:change', {
        detail: {
          subscriptionSelected: this.#isSubscriptionSelected(),
          sellingPlanId: this.#activeSellingPlanId(),
        },
        bubbles: true,
      })
    );
  }

  /**
   * @returns {boolean} Whether the subscription option is selected.
   */
  #isSubscriptionSelected() {
    const { subscribeRadio } = this.refs;
    return subscribeRadio instanceof HTMLInputElement && subscribeRadio.checked;
  }

  /**
   * @returns {string | null} The active selling plan id, or null for one-time purchases.
   */
  #activeSellingPlanId() {
    const { sellingPlanSelect } = this.refs;

    if (!this.#isSubscriptionSelected()) return null;
    if (!(sellingPlanSelect instanceof HTMLSelectElement)) return null;

    return sellingPlanSelect.value || null;
  }

  #syncState() {
    const subscriptionSelected = this.#isSubscriptionSelected();
    const { subscribeCard, onetimeCard, sellingPlanSelect } = this.refs;

    if (subscribeCard instanceof HTMLElement) {
      subscribeCard.dataset.selected = String(subscriptionSelected);
    }

    if (onetimeCard instanceof HTMLElement) {
      onetimeCard.dataset.selected = String(!subscriptionSelected);
    }

    if (sellingPlanSelect instanceof HTMLSelectElement) {
      sellingPlanSelect.disabled = !subscriptionSelected;
    }

    this.#updateAddToCartLabel(subscriptionSelected);
  }

  /**
   * Updates the buy-buttons add-to-cart label with the active option price.
   *
   * @param {boolean} subscriptionSelected - Whether the subscription option is active.
   */
  #updateAddToCartLabel(subscriptionSelected) {
    const formId = this.dataset.formId;
    if (!formId) return;

    const form = document.getElementById(formId);
    if (!form) return;

    const container = form.closest('product-form-component') ?? form;
    const label = container.querySelector('.add-to-cart-text__content > span');
    if (!(label instanceof HTMLElement)) return;

    if (this.#originalButtonLabel === null) {
      this.#originalButtonLabel = label.textContent?.trim() ?? '';
    }

    const price = subscriptionSelected ? this.dataset.subscribePrice : this.dataset.onetimePrice;
    if (!price || !this.#originalButtonLabel) return;

    label.textContent = `${this.#originalButtonLabel}  |  ${price}`;
  }
}

if (!customElements.get('purchase-options-component')) {
  customElements.define('purchase-options-component', PurchaseOptionsComponent);
}
