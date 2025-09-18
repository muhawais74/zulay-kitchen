document.addEventListener('DOMContentLoaded', function() {
    const parser = new DOMParser();

    const SELECTORS = {
        productsContainer: '[js-bundle-products-container]',
        titleContainer: '.bundle__title-container',
        addToBundleBtn: '[js-add-to-bundle-btn]',
        productCard: '[js-bundle-product-card]',
        itemsSummary: '.items__summary-bundle',
        dummyItem: '.summary__item.dummy',
        swatchFieldset: '.color__swatched-bundle fieldset',
        collectionHead: '[js-collection-item-head]',
        bundleSummaryHead: '[js-bundle-summary-head]',
        quantityPicker: '.bundle__quantity-picker',
        quantityInput: '.bundle__quantity-picker .quantity-input',
        additionBtn: '.bundle__quantity-picker .addition',
        subtractionBtn: '.bundle__quantity-picker .subtraction'
    };

    window.__currenctSymbol = document.querySelector(SELECTORS.productsContainer).dataset.shopCurrencySymbol;

    const addSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M352 128C352 110.3 337.7 96 320 96C302.3 96 288 110.3 288 128L288 288L128 288C110.3 288 96 302.3 96 320C96 337.7 110.3 352 128 352L288 352L288 512C288 529.7 302.3 544 320 544C337.7 544 352 529.7 352 512L352 352L512 352C529.7 352 544 337.7 544 320C544 302.3 529.7 288 512 288L352 288L352 128z"/></svg>`;
    const removeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM231 231C240.4 221.6 255.6 221.6 264.9 231L319.9 286L374.9 231C384.3 221.6 399.5 221.6 408.8 231C418.1 240.4 418.2 255.6 408.8 264.9L353.8 319.9L408.8 374.9C418.2 384.3 418.2 399.5 408.8 408.8C399.4 418.1 384.2 418.2 374.9 408.8L319.9 353.8L264.9 408.8C255.5 418.2 240.3 418.2 231 408.8C221.7 399.4 221.6 384.2 231 374.9L286 319.9L231 264.9C221.6 255.5 221.6 240.3 231 231z"/></svg>`;

    // bundle state stored globally so it survives DOM replacements
    window.__bundleState = window.__bundleState || []; // array of { variantId, title, image, price, productHandle, qty }

    function getProductsContainer() {
        return document.querySelector(SELECTORS.productsContainer);
    }
    function getTitleContainer() {
        return document.querySelector(SELECTORS.titleContainer);
    }
    function getItemsContainer() {
        return document.querySelector(SELECTORS.itemsSummary);
    }
    function getDummyItem() {
        return getItemsContainer()?.querySelector(SELECTORS.dummyItem);
    }

    function findBundleItem(variantId) {
        return window.__bundleState.find(item => String(item.variantId) === String(variantId));
    }
    function addBundleItem(payload) {
        const existing = findBundleItem(payload.variantId);
        if (existing) {
            existing.qty += 1;
        } else {
            window.__bundleState.unshift({ ...payload, qty: 1 });
        }
        renderOrUpdateSummaryItem(payload.variantId);
        updateSummaryIndexes();
        updateCartAddButtonState();
    }
    function setBundleItemQty(variantId, qty) {
        const idx = window.__bundleState.findIndex(i => String(i.variantId) === String(variantId));
        if (idx === -1) return;
        if (qty <= 0) {
            // remove
            window.__bundleState.splice(idx, 1);
            const node = getItemsContainer()?.querySelector(`.summary__item[data-variant-id="${variantId}"]`);
            node?.remove();
        } else {
            window.__bundleState[idx].qty = qty;
            renderOrUpdateSummaryItem(variantId);
        }
        updateDummyVisibility();
        updateSummaryIndexes();
        updateCartAddButtonState();
    }
    function getCartAddButton() {
        return document.querySelector('.bundle__cart-add button');
    }
    function updateCartAddButtonState() {
        const btn = getCartAddButton();
        if (!btn) return;
        const hasItems = Array.isArray(window.__bundleState) && window.__bundleState.length > 0;
        btn.disabled = !hasItems;
        btn.classList.toggle('is-disabled', !hasItems);
        // ensure pointer-events off for disabled
        if (btn.disabled) btn.setAttribute('aria-disabled', 'true'); else btn.removeAttribute('aria-disabled');
    }

    function resetBundleUIAndState() {
        // clear state
        window.__bundleState = [];
        // remove all summary items except dummy
        const itemsContainer = getItemsContainer();
        if (itemsContainer) {
            Array.from(itemsContainer.querySelectorAll('.summary__item:not(.dummy)')).forEach(n => n.remove());
        }
        // reset product cards (show add button, hide quantity pickers)
        initializeProductCardsUI();
        // reindex / dummy visibility
        updateDummyVisibility();
        updateSummaryIndexes();
        updateCartAddButtonState();
    }
    
    // intercept bundle form submit and add items to cart via AJAX
    /*(function attachBundleFormHandler() {
        const form = document.querySelector('.bundle__summary form.shopify-product-form');
        if (!form) return;

        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            if (!Array.isArray(window.__bundleState) || window.__bundleState.length === 0) return;

            const btn = getCartAddButton();
            const originalText = btn?.innerHTML;
            try {
                // disable UI
                if (btn) {
                    btn.disabled = true;
                    btn.classList.add('is-loading');
                    btn.setAttribute('aria-busy', 'true');
                    btn.innerHTML = 'Adding...';
                }

                // Add each variant to cart sequentially to preserve order and avoid race conditions
                for (const item of window.__bundleState) {
                    const items = {
                        id: Number(item.variantId),
                        quantity: Number(item.qty || 1)
                    };
                    // /cart/add.js expects a single item items
                    const res = await fetch('/cart/add.js', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(items),
                        credentials: 'same-origin'
                    });
                    if (!res.ok) {
                        const errorText = await res.text().catch(()=>'');
                        throw new Error('Failed adding to cart: ' + (errorText || res.status));
                    }
                }

                // Optionally refresh cart data in theme: some themes dispatch events - trigger refresh
                document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
                document.documentElement.dispatchEvent(new CustomEvent('cart:change', { bubbles: true, detail: { addedBundle: true } }));

                // reset bundle on success
                resetBundleUIAndState();
            } catch (err) {
                console.error('Bundle add to cart failed', err);
                // TODO: show UI error to users if needed
            } finally {
                if (btn) {
                    btn.classList.remove('is-loading');
                    btn.removeAttribute('aria-busy');
                    btn.innerHTML = originalText || 'Add Bundle To Cart';
                    updateCartAddButtonState();
                }
            }
        });
    })();*/
    function updateDummyVisibility() {
        const itemsContainer = getItemsContainer();
        const dummyItem = getDummyItem();
        if (!itemsContainer || !dummyItem) return;
        const realItems = itemsContainer.querySelectorAll('.summary__item:not(.dummy)');
        dummyItem.style.display = realItems.length > 0 ? 'none' : '';
    }

    function createSummaryItemElement({ title = '', image = '', variantId = '', price = '', qty = 1, index = 0, variantTitle = '' } = {}) {
        const item = document.createElement('div');
        item.className = 'summary__item active';
        item.setAttribute('data-variant-id', variantId);

        // <div class="qty-badge" style="margin-right:10px;font-weight:600">${qty}</div>
        item.innerHTML = `
            <div class="img">
                <img src="${image}" alt="${title}" style="width:50px;height:auto;object-fit:cover;border-radius:6px"/>
            </div>
            <div class="info__content">
                <span class="product__title">${title}</span>
                <span class="variant__title">${variantTitle}</span>
                <div class="info__meta " data-price="${price}" style="font-size:.9rem;color:#555">${window.__currenctSymbol}.${price}</div>
            </div>
            <input type="hidden" js-variant-id name="items[${index}][id]" value="${variantId}" />
            <input type="hidden" js-variant-quantity name="items[${index}][quantity]" value="${qty}" />
            <div class="item__cta">
                <div class="add__icon" style="display:none">${addSvg}</div>
                <div class="remove__icon">${removeSvg}</div>
            </div>
        `;
        return item;
    }

    function renderOrUpdateSummaryItem(variantId) {
        const bundleItem = findBundleItem(variantId);
        const itemsContainer = getItemsContainer();
        const dummyItem = getDummyItem();
        if (!itemsContainer) return;

        const existingNode = itemsContainer.querySelector(`.summary__item[data-variant-id="${variantId}"]`);
        if (!bundleItem) {
            existingNode?.remove();
            updateDummyVisibility();
            updateSummaryIndexes();
            return;
        }

        if (existingNode) {
            // update qty and maybe src/title/price if changed
            const qtyBadge = existingNode.querySelector('.qty-badge');
            if (qtyBadge) qtyBadge.textContent = bundleItem.qty;
            const img = existingNode.querySelector('.img img');
            if (img && bundleItem.image) img.src = bundleItem.image;
            const titleSpan = existingNode.querySelector('.info__content .product__title');
            if (titleSpan) titleSpan.textContent = bundleItem.title;
            const variantSpan = existingNode.querySelector('.info__content .variant__title');
                if (variantSpan) variantSpan.textContent = bundleItem.variantTitle;
            const meta = existingNode.querySelector('.info__meta');
            if (meta) meta.textContent = bundleItem.price;

            // ensure hidden inputs reflect correct index & qty
            const idx = window.__bundleState.findIndex(i => String(i.variantId) === String(variantId));
            if (idx !== -1) {
                existingNode.setAttribute('data-index', idx);
                const idInput = existingNode.querySelector('[js-variant-id]');
                const qtyInput = existingNode.querySelector('[js-variant-quantity]');
                if (idInput) {
                    idInput.name = `items[${idx}][id]`;
                    idInput.value = variantId;
                }
                if (qtyInput) {
                    qtyInput.name = `items[${idx}][quantity]`;
                    qtyInput.value = bundleItem.qty;
                }
            }
        } else {
            // determine index from state (match state ordering)
            const index = Math.max(0, window.__bundleState.findIndex(i => String(i.variantId) === String(variantId)));
            const node = createSummaryItemElement({ ...bundleItem, index });
            // insert after dummy (so it appears at start of list after dummy)
            if (dummyItem && dummyItem.nextSibling) {
                itemsContainer.insertBefore(node, dummyItem.nextSibling);
            } else {
                itemsContainer.appendChild(node);
            }
        }

        updateDummyVisibility();
        updateSummaryIndexes();
    }
    function updateSummaryIndexes() {
        const itemsContainer = getItemsContainer();
        if (!itemsContainer) return;
        const nodes = Array.from(itemsContainer.querySelectorAll('.summary__item:not(.dummy)'));
        const newState = [];
        let bundleSum = 0;
        nodes.forEach((node, idx) => {
            bundleSum += Number(formatAmount(parseMoney(node.querySelector('[data-price]').dataset.price)));
            node.setAttribute('data-index', idx);
            const indexBadge = node.querySelector('.index-badge');
            if (indexBadge) indexBadge.textContent = idx;
            const vid = node.getAttribute('data-variant-id');
            const stateItem = window.__bundleState.find(i => String(i.variantId) === String(vid));
            // update hidden inputs names/values to match new index
            const idInput = node.querySelector('[js-variant-id]');
            const qtyInput = node.querySelector('[js-variant-quantity]');
            if (idInput) idInput.name = `items[${idx}][id]`;
            if (qtyInput) qtyInput.name = `items[${idx}][quantity]`;
            if (stateItem) {
                // also ensure qty input value matches state
                if (qtyInput) qtyInput.value = stateItem.qty;
                newState.push(stateItem);
            }
        });
        // replace state array with order matching DOM
        window.__bundleState = newState;
        document.querySelector('.build__your-bundle [js-bundle-total-price]').textContent=window.__currenctSymbol + bundleSum.toFixed(2);
    }

    function updateProductCardUIForVariant(card) {
        if (!card) return;
        const variantId = card.getAttribute('data-variant-id');
        const addBtn = card.querySelector(SELECTORS.addToBundleBtn);
        const quantityPicker = card.querySelector(SELECTORS.quantityPicker);
        const quantityInput = card.querySelector(SELECTORS.quantityInput);

        const bundleItem = findBundleItem(variantId);

        if (bundleItem) {
            // show quantity picker and set value
            if (addBtn) addBtn.style.display = 'none';
            if (quantityPicker) quantityPicker.style.display = 'flex';
            if (quantityInput) quantityInput.value = bundleItem.qty;
        } else {
            // show add button
            if (addBtn) addBtn.style.display = '';
            if (quantityPicker) quantityPicker.style.display = 'none';
            if (quantityInput) quantityInput.value = 1;
        }
    }

    // initialize UI for all product cards (use after fetch replacement)
    function initializeProductCardsUI() {
        const cards = document.querySelectorAll(SELECTORS.productCard);
        cards.forEach(card => {
            // ensure quantity picker hidden by default
            const qp = card.querySelector(SELECTORS.quantityPicker);
            if (qp) qp.style.display = 'none';
            updateProductCardUIForVariant(card);
        });
    }

    document.addEventListener('click', async function (e) {
        const wrapper = e.target.closest('[js-add-bundle-to-cart]');
        if (!wrapper) return;
        e.preventDefault();

        // prefer a real <button> inside the wrapper, otherwise use wrapper itself
        const btn = wrapper.querySelector('button') || wrapper;
        if (!btn) return;

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.style.opacity = 0.3;
        btn.style.opacity='0.3';

        try {
            // collect all id inputs inside summary (the hidden inputs like items[0][id])
            const inputs = Array.from(document.querySelectorAll('.items__summary-bundle input[name*="[id]"]'));
            if (inputs.length === 0) throw new Error('No bundle items found');

            // take the first input as parent variant
            const parentVariantId = 46988164235502;
            // random static number for parent_id (generated per click)
            const parentId = 46988164235502;

            const selected = inputs;
            // place the synthetic parentId item first, then append the real parent variant and selected children
            const items = [
                { id: Number(parentVariantId), quantity: 1 },
                ...selected.map(input => ({ id: Number(input.value), quantity: 1, parent_id: parentVariantId }))
            ];
            const res = await fetch('/cart/add.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items }),
                credentials: 'same-origin'
            });

            if (!res.ok) {
                const text = await res.text().catch(()=>'');
                throw new Error('Add to cart failed: ' + (text || res.status));
            } else {
                document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
                setTimeout(()=>{
                    document.querySelector('.header__cart-link a[aria-controls="cart-drawer"]')?.click();
                    window.bundleReset();
                    btn.style.opacity='1';
                },10)
            }


        } catch (err) {
            console.error('Bundle add to cart error', err);
            btn.textContent = 'Error';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        }
    });

    // Delegated click handler for Add to Bundle
    document.addEventListener('click', function (e) {
        const atb = e.target.closest(SELECTORS.addToBundleBtn);
        if (!atb) return;

        const cardContainer = atb.closest(SELECTORS.productCard);
        const itemsContainer = getItemsContainer();
        const dummyItem = getDummyItem();
        if (!cardContainer || !itemsContainer) return;

        const title = cardContainer.dataset.productTitle || '';
        const image = cardContainer.dataset.productImage || '';
        const variantId = cardContainer.dataset.variantId || '';
        const price = cardContainer.dataset.price || '';
        const productHandle = cardContainer.dataset.productHandle || '';
        const variantTitle = cardContainer.dataset.variantTitle || ''; 

        // add to state (qty 1 or increment)
        addBundleItem({ variantId, title, image, price, productHandle, variantTitle });

        // switch UI on this card: hide add button, show quantity picker with correct value
        updateProductCardUIForVariant(cardContainer);

        // open summary
        const summaryWrapper = document.querySelector('.bundle__summary');
        if (summaryWrapper) summaryWrapper.classList.add('active');
    });

    // Delegated click handler for remove icon inside summary list
    document.addEventListener('click', function (e) {
        const removeBtn = e.target.closest('.remove__icon');
        if (!removeBtn) return;
        const item = removeBtn.closest('.summary__item');
        if (!item) return;
        const variantId = item.getAttribute('data-variant-id');
        // remove from state entirely
        setBundleItemQty(variantId, 0);

        // update any product card that matches this variant to show add button
        const matchingCard = document.querySelector(`${SELECTORS.productCard}[data-variant-id="${variantId}"]`);
        if (matchingCard) updateProductCardUIForVariant(matchingCard);

        updateDummyVisibility();
    });

    // Delegated handler for addition/subtraction buttons inside product card quantity picker
    document.addEventListener('click', function (e) {
        const addBtn = e.target.closest(SELECTORS.additionBtn);
        const subBtn = e.target.closest(SELECTORS.subtractionBtn);

        if (!addBtn && !subBtn) return;

        const card = (addBtn || subBtn).closest(SELECTORS.productCard);
        if (!card) return;
        const variantId = card.getAttribute('data-variant-id');
        if (!variantId) return;

        const quantityInput = card.querySelector(SELECTORS.quantityInput);
        const currentQty = Number(quantityInput?.value || 0);

        if (addBtn) {
            // increment
            addBundleItem({
                variantId,
                title: card.dataset.productTitle || '',
                image: card.dataset.productImage || '',
                price: card.dataset.price || '',
                productHandle: card.dataset.productHandle || ''
            });
            const stateItem = findBundleItem(variantId);
            if (quantityInput && stateItem) quantityInput.value = stateItem.qty;
        } else {
            // subtraction
            const stateItem = findBundleItem(variantId);
            if (!stateItem) return;
            const newQty = Math.max(0, stateItem.qty - 1);
            setBundleItemQty(variantId, newQty);
            if (quantityInput) quantityInput.value = newQty > 0 ? newQty : 1;
            // if removed, switch back to add button
            if (newQty <= 0) {
                const addBtnEl = card.querySelector(SELECTORS.addToBundleBtn);
                const qp = card.querySelector(SELECTORS.quantityPicker);
                if (addBtnEl) addBtnEl.style.display = '';
                if (qp) qp.style.display = 'none';
            }
        }
    });
    function formatAmount(amount) {
        return amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2);
    }
    function parseMoney(str) {
        // Remove commas and convert to a number
        return parseFloat(str.replace(/,/g, ''));
    }
    // Delegated handler for variant swatch change
    document.addEventListener('change', function (e) {
        const input = e.target;
        const fieldset = input.closest(SELECTORS.swatchFieldset);
        if (!fieldset) return;

        const cardContainer = fieldset.closest(SELECTORS.productCard);
        if (!cardContainer) return;

        const selectedVariant = fieldset.querySelector('input:checked');
        if (!selectedVariant) return;

        try {
            const selectedVariantId = selectedVariant.dataset.variantId;
            const variantMediaRaw = selectedVariant.dataset.variantMedia;
            const variantTitle = selectedVariant.dataset.variantTitle;
            const variantPrice = selectedVariant.dataset.variantPrice;
            const compareAtPrice = selectedVariant.dataset.compareAtPrice;
            const variantMediaData = variantMediaRaw ? JSON.parse(variantMediaRaw) : null;
            const currentMediaElement = cardContainer.querySelector('.bundle_card__image img');

            const comparePriceEligible = Number(compareAtPrice) > Number(variantPrice);
            console.log({compareAtPrice}, {variantPrice}, {comparePriceEligible});

            if (variantMediaData?.src) {
                currentMediaElement?.setAttribute('src', variantMediaData.src);
                // update dataset product image too so summary updates can pick correct src
                cardContainer.setAttribute('data-product-image', variantMediaData.src);
            }
            if(variantPrice) {
                cardContainer.querySelector('.product__price-bundle').textContent = window.__currenctSymbol + variantPrice.replace('.00', '');
                cardContainer.setAttribute('data-price', variantPrice);
            }
            if(compareAtPrice && comparePriceEligible) {
                cardContainer.querySelector('.product__price-bundle.compare__price').textContent = window.__currenctSymbol +  compareAtPrice.replace('.00', '');
            } else {
                cardContainer.querySelector('.product__price-bundle.compare__price').textContent = ''
            }
            if (selectedVariantId) {
                // when variant changes we must update the card dataset
                const prevVariantId = cardContainer.getAttribute('data-variant-id');
                cardContainer.setAttribute('data-variant-id', selectedVariantId);

                // If new variant exists in bundle -> show quantity picker with its qty
                // otherwise show add button
                updateProductCardUIForVariant(cardContainer);

                // Additionally if previous variant had qty in bundle and we switched away,
                // the UI for this card should show add button (already handled by updateProductCardUIForVariant).
            }
            if(variantTitle) {
                cardContainer.setAttribute('data-variant-title', variantTitle);
            }
        } catch (err) {
            console.warn('Failed parsing variant media', err);
        }
    });

    // Collection head clicks -> fetch new collection view and replace products + titles
    if (!window.__bundle_collection_click_attached) {
        document.addEventListener('click', async function (e) {
            const head = e.target.closest(SELECTORS.collectionHead);
            if (!head) return;

            const collectionUrl = head.dataset.collectionUrl;
            if (!collectionUrl) return;

            const fetchUrl = `${collectionUrl}?view=bundle`;
            try {
                const res = await fetch(fetchUrl, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
                if (!res.ok) throw new Error('Network response not ok');
                const html = await res.text();
                const doc = parser.parseFromString(html, 'text/html');

                const newProducts = doc.querySelector(SELECTORS.productsContainer);
                const newTitles = doc.querySelector(SELECTORS.titleContainer);

                const currentProducts = getProductsContainer();
                const currentTitles = getTitleContainer();

                if (newProducts && currentProducts) {
                    currentProducts.replaceWith(newProducts);
                }
                if (newTitles && currentTitles) {
                    currentTitles.replaceWith(newTitles);
                }

                // After DOM replacement, reinitialize product cards UI to reflect bundleState
                initializeProductCardsUI();

                // After DOM replacement, ensure dummy visibility recalculated and summary updated
                window.__bundleState.forEach(item => renderOrUpdateSummaryItem(item.variantId));
                updateDummyVisibility();

                const summaryWrapper = document.querySelector('.bundle__summary');
                if (summaryWrapper) summaryWrapper.classList.add('active');

            } catch (err) {
                console.error('Failed to load collection bundle view', err);
            }
        });
        window.__bundle_collection_click_attached = true;
    }

    // summary toggle for mobile - attach once
    if (!window.__bundle_summary_head_attached) {
        const summaryBar = document.querySelector(SELECTORS.bundleSummaryHead);
        if (summaryBar) {
            summaryBar.addEventListener('click', function ({ currentTarget }) {
                const bundleBundleWrapper = currentTarget.closest('.bundle__summary');
                bundleBundleWrapper.classList.toggle('active');
            });
        }
        window.__bundle_summary_head_attached = true;
    }

    // initial setup
    initializeProductCardsUI();
    // render existing bundle items (if any)
    window.__bundleState.forEach(item => renderOrUpdateSummaryItem(item.variantId));
    updateDummyVisibility();
    updateCartAddButtonState();
    window.bundleReset = function () {
        resetBundleUIAndState();
    };
});