import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { formatMoney } from '@theme/money-formatting';
import { CartLinesUpdateEvent } from '@shopify/events';

const DEFAULT_MONEY_FORMAT = '${{amount}}';

/**
 * A nested bottom sheet rendered inside the cart drawer that lists a product's
 * variant options so the shopper can pick which one to add to the cart.
 *
 * Opens when the shopper taps an upsell "Add" button carrying
 * `[data-option-drawer-trigger]`, or the quantity "+" button on a cart line
 * whose row carries `data-variant-count` greater than 1.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} overlay - The overlay element.
 * @property {HTMLElement} panel - The slide-up panel element.
 * @property {HTMLElement} optionsList - The container populated with variant rows.
 * @property {HTMLTemplateElement} variantRowTemplate - The template for a variant row.
 *
 * @extends {Component<Refs>}
 */
class CartOptionDrawer extends Component {
  requiredRefs = ['overlay', 'panel', 'optionsList', 'variantRowTemplate'];

  /** @type {AbortController | null} */
  #listenersAbortController = null;

  /** @type {AbortController | null} */
  #fetchAbortController = null;

  connectedCallback() {
    super.connectedCallback();

    this.#listenersAbortController = new AbortController();
    const { signal } = this.#listenersAbortController;

    // Capture phase so upsell "Add" clicks and multi-variant "+" clicks are
    // intercepted before the theme's own component handlers run.
    document.addEventListener('click', this.#onDocumentClick, { capture: true, signal });
    document.addEventListener('keydown', this.#onKeydown, { capture: true, signal });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#listenersAbortController?.abort();
    this.#fetchAbortController?.abort();
  }

  get isOpen() {
    return this.hasAttribute('data-open');
  }

  get moneyFormat() {
    return this.dataset.moneyFormat || DEFAULT_MONEY_FORMAT;
  }

  get currency() {
    return window.Shopify?.currency?.active || 'USD';
  }

  /**
   * Handles document-level clicks in the capture phase.
   * @param {MouseEvent} event
   */
  #onDocumentClick = (event) => {
    const dialog = this.closest('dialog');
    const target = event.target instanceof Element ? event.target : null;
    if (!dialog || !target || !dialog.contains(target)) return;

    // When the sheet is open, a click on the overlay closes it.
    if (this.isOpen && target === this.refs.overlay) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }

    const trigger = target.closest('[data-option-drawer-trigger]');
    if (trigger instanceof HTMLElement) {
      event.preventDefault();
      event.stopPropagation();
      this.#handleTrigger(trigger);
      return;
    }

    // Intercept the quantity "+" button on multi-variant cart lines so the
    // shopper picks which variant to add instead of blindly incrementing.
    const plusButton = target.closest('button[name="plus"]');
    if (!plusButton || !plusButton.closest('.cart-drawer__items')) return;

    const row = plusButton.closest('.cart-items__table-row');
    if (!(row instanceof HTMLElement)) return;

    const variantCount = Number(row.dataset.variantCount || 1);
    const productUrl = row.dataset.productUrl;

    if (variantCount > 1 && productUrl) {
      event.preventDefault();
      event.stopPropagation();
      this.openForProduct(productUrl);
    }
  };

  /**
   * Closes the sheet on Escape without closing the parent cart drawer.
   * @param {KeyboardEvent} event
   */
  #onKeydown = (event) => {
    if (event.key !== 'Escape' || !this.isOpen) return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
  };

  /**
   * Handles an upsell "Add" trigger click.
   * @param {HTMLElement} trigger
   */
  async #handleTrigger(trigger) {
    const variantCount = Number(trigger.dataset.variantCount || 1);
    const variantId = Number(trigger.dataset.variantId || 0);
    const productUrl = trigger.dataset.productUrl;

    if (variantCount <= 1 && variantId) {
      // Single-variant products add directly without opening the sheet.
      if (trigger instanceof HTMLButtonElement) trigger.disabled = true;
      try {
        await this.addVariant(variantId);
      } finally {
        if (trigger instanceof HTMLButtonElement) trigger.disabled = false;
      }
      return;
    }

    if (productUrl) this.openForProduct(productUrl);
  }

  /**
   * Opens the sheet and renders the available variants for a product.
   * @param {string} productUrl - The product URL (without query params).
   */
  async openForProduct(productUrl) {
    this.open();
    this.#renderMessage('Loading...');

    this.#fetchAbortController?.abort();
    this.#fetchAbortController = new AbortController();

    try {
      const url = productUrl.split('?')[0];
      const response = await fetch(`${url}.js`, {
        headers: { Accept: 'application/json' },
        signal: this.#fetchAbortController.signal,
      });
      if (!response.ok) throw new Error(`Failed to fetch product: ${response.status}`);

      const product = await response.json();
      this.#renderVariants(product);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('[cart-option-drawer]', error);
      this.#renderMessage('Unable to load options. Please try again.');
    }
  }

  open() {
    this.setAttribute('data-open', '');
    this.refs.overlay.removeAttribute('hidden');
    this.refs.panel.removeAttribute('hidden');
  }

  close() {
    this.removeAttribute('data-open');
    this.refs.overlay.setAttribute('hidden', '');
    this.refs.panel.setAttribute('hidden', '');
    this.#fetchAbortController?.abort();
  }

  /**
   * Renders a status message inside the options list.
   * @param {string} message
   */
  #renderMessage(message) {
    const paragraph = document.createElement('p');
    paragraph.className = 'cart-option-drawer__message';
    paragraph.textContent = message;
    this.refs.optionsList.replaceChildren(paragraph);
  }

  /**
   * Renders the variant rows for a product by cloning the row template.
   * @param {{ title: string, variants: Array<{ id: number, title: string, price: number, available: boolean }> }} product
   */
  #renderVariants(product) {
    const { optionsList, variantRowTemplate } = this.refs;
    const rows = [];

    for (const variant of product.variants) {
      const fragment = document.importNode(variantRowTemplate.content, true);
      const row = fragment.firstElementChild;
      if (!(row instanceof HTMLElement)) continue;

      const title = row.querySelector('[data-variant-title]');
      const price = row.querySelector('[data-variant-price]');
      const addButton = row.querySelector('[data-variant-add]');

      if (title) {
        title.textContent = variant.title === 'Default Title' ? product.title : variant.title;
      }
      if (price) {
        price.textContent = formatMoney(variant.price, this.moneyFormat, this.currency);
      }
      if (addButton instanceof HTMLButtonElement) {
        addButton.dataset.variantId = String(variant.id);
        if (variant.available) {
          addButton.addEventListener('click', this.#onVariantAddClick);
        } else {
          addButton.disabled = true;
          addButton.textContent = 'Sold out';
        }
      }

      rows.push(row);
    }

    if (rows.length === 0) {
      this.#renderMessage('No options available.');
      return;
    }

    optionsList.replaceChildren(...rows);
  }

  /**
   * Handles a click on a variant row's add button.
   * @param {MouseEvent} event
   */
  #onVariantAddClick = async (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;

    const variantId = Number(button.dataset.variantId || 0);
    if (!variantId) return;

    button.disabled = true;

    try {
      await this.addVariant(variantId);
      this.close();
    } catch (error) {
      console.error('[cart-option-drawer]', error);
      button.disabled = false;
    }
  };

  /**
   * Adds a variant to the cart and notifies the theme's cart components so the
   * drawer re-renders through the Section Rendering API response.
   * @param {number} variantId - The variant ID to add.
   */
  async addVariant(variantId) {
    const sectionsToUpdate = new Set(['cart-drawer-section']);
    for (const item of document.querySelectorAll('cart-items-component')) {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        sectionsToUpdate.add(item.dataset.sectionId);
      }
    }

    const deferredEventPromise = CartLinesUpdateEvent.createPromise();

    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action: 'add',
        context: 'cart',
        lines: [{ merchandiseId: String(variantId), quantity: 1 }],
        promise: deferredEventPromise.promise,
      })
    );

    try {
      const body = JSON.stringify({
        id: variantId,
        quantity: 1,
        sections: Array.from(sectionsToUpdate).join(','),
        sections_url: window.location.pathname,
      });

      const response = await fetch(Theme.routes.cart_add_url, fetchConfig('json', { body }));
      const addData = await response.json();

      if (addData.status) {
        throw new Error(addData.message || 'Add to cart failed');
      }

      // `/cart/add.js` returns only the added lines — fetch the full cart so
      // listeners receive an accurate cart object.
      const cartResponse = await fetch(`${Theme.routes.cart_url}.js`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const cartData = await cartResponse.json();

      deferredEventPromise.resolve({
        cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cartData),
        detail: {
          sections: addData.sections ?? undefined,
          items: cartData.items,
          itemCount: cartData.item_count,
          source: 'cart-option-drawer',
          didError: false,
        },
      });
    } catch (error) {
      deferredEventPromise.reject(error);
      throw error;
    }
  }
}

// Tag ends in `-component` so component.js scopes this element's refs away
// from the parent theme-drawer even before this module has loaded.
if (!customElements.get('cart-option-drawer-component')) {
  customElements.define('cart-option-drawer-component', CartOptionDrawer);
}
