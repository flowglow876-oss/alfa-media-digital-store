/**
 * Alfa Media Digital Store - Main Client Logic
 * 
 * Vanilla ES module driving the storefront UI components from config.js:
 * - Guides carousel with arrow navigation and scroll-snap
 * - Chapter accordion
 * - Accessible FAQ accordion
 * - Lightbox gallery for preview mockups
 * - Mobile navigation menu
 * - Checkout button event bindings
 */

import { STORE_CONFIG } from './config.js';
import { startCheckout } from './checkout.js';

document.addEventListener('DOMContentLoaded', () => {
  renderStoreContent();
  initMobileMenu();
  initCarousel();
  initChapterAccordions();
  initFaqAccordion();
  initLightbox();
  bindCheckoutButtons();
  initSmoothScroll();
  initStickyBar();
});

/**
 * Populate dynamic fields from config.js
 */
function renderStoreContent() {
  // Brand & Price replacements
  document.querySelectorAll('.js-store-name').forEach(el => el.textContent = STORE_CONFIG.STORE_NAME);
  document.querySelectorAll('.js-price').forEach(el => el.textContent = `${STORE_CONFIG.CURRENCY}${STORE_CONFIG.PRICE_INR}`);
  document.querySelectorAll('.js-orig-price').forEach(el => el.textContent = `${STORE_CONFIG.CURRENCY}${STORE_CONFIG.ORIGINAL_VALUE_INR}`);
  document.querySelectorAll('.js-support-email').forEach(el => {
    el.textContent = STORE_CONFIG.SUPPORT_EMAIL;
    if (el.tagName === 'A') el.href = `mailto:${STORE_CONFIG.SUPPORT_EMAIL}`;
  });
  document.querySelectorAll('.js-whatsapp').forEach(el => {
    el.textContent = STORE_CONFIG.WHATSAPP_DISPLAY;
    if (el.tagName === 'A') el.href = `https://wa.me/${STORE_CONFIG.WHATSAPP_NUMBER.replace(/\+/g, '')}`;
  });

  // Render Topic Strip
  const topicContainer = document.getElementById('topic-strip-list');
  if (topicContainer) {
    topicContainer.innerHTML = STORE_CONFIG.TOPICS.map(t => `
      <div class="topic-chip">
        <span class="topic-icon">●</span>
        <span>${escapeHtml(t.label)}</span>
      </div>
    `).join('');
  }

  // Render 7 Guides in Carousel (Duplicated for seamless infinite slow auto-scroll)
  const guideIcons = { '01': '⚡', '02': '📦', '03': '🌐', '04': '✂️', '05': '💬', '06': '🤖', '07': '📣' };
  const guidesCarousel = document.getElementById('guides-carousel-track');
  if (guidesCarousel) {
    const renderCard = (g, isClone = false) => `
      <div class="guide-card" data-guide-id="${g.id}" ${isClone ? 'aria-hidden="true"' : ''}>
        <!-- 100% CLEAR Cover Image Container (No green overlay on top of image) -->
        <div class="guide-card-cover-wrap">
          <img src="${g.image}" alt="${escapeHtml(g.title)}" class="guide-card-img" loading="lazy" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.removeAttribute('data-fallback');}" data-fallback="${g.fallbackImage || ''}">
          <div class="guide-card-floating-badges">
            <span class="guide-card-tag">${escapeHtml(g.tag)}</span>
            <span class="guide-card-icon-badge" aria-hidden="true">${guideIcons[g.number] || '📄'}</span>
          </div>
        </div>

        <!-- Clean Card Content Body Below Image (Crisp, High-Contrast Typography) -->
        <div class="guide-card-body">
          <div class="guide-card-meta-row">
            <span class="guide-card-number">GUIDE ${g.number}</span>
            <span class="format-pdf-badge">Format: PDF</span>
          </div>
          <h3 class="guide-card-title">${escapeHtml(g.title)}</h3>
          <p class="guide-card-desc">${escapeHtml(g.summary)}</p>
          <div class="guide-card-footer">
            <span class="guide-card-pages">${g.pages} Pages (PDF)</span>
            <button class="btn btn-pill-white js-buy-btn" aria-label="Buy Bundle to Get Guide ${g.number}">
              <span>Included in Bundle</span>
              <span class="arrow-circle-sm" aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // Render original and duplicate sets for seamless infinite loop
    guidesCarousel.innerHTML = STORE_CONFIG.GUIDES.map(g => renderCard(g, false)).join('') +
                               STORE_CONFIG.GUIDES.map(g => renderCard(g, true)).join('') +
                               STORE_CONFIG.GUIDES.map(g => renderCard(g, true)).join('');
  }

  // Render Chapter Breakdown Accordion
  const chaptersAccordion = document.getElementById('chapters-accordion-root');
  if (chaptersAccordion) {
    chaptersAccordion.innerHTML = STORE_CONFIG.GUIDES.map((g, idx) => `
      <div class="accordion-item chapter-item" id="accordion-${g.id}">
        <button class="accordion-trigger chapter-trigger" aria-expanded="${idx === 0 ? 'true' : 'false'}" aria-controls="content-${g.id}">
          <span class="chapter-badge">Guide ${g.number}</span>
          <span class="accordion-title">${escapeHtml(g.title)}</span>
          <span class="chapter-meta">${g.pages} Pages</span>
          <span class="accordion-icon" aria-hidden="true">&plus;</span>
        </button>
        <div id="content-${g.id}" class="accordion-content ${idx === 0 ? 'open' : ''}" role="region">
          <div class="accordion-body">
            <p class="chapter-summary">${escapeHtml(g.summary)}</p>
            <h4 class="chapter-subheading">Core Modules &amp; Checklists:</h4>
            <ul class="chapter-list">
              ${g.chapters.map(ch => `<li><span class="bullet-dot">▪</span><span>${escapeHtml(ch)}</span></li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Render Preview Lightbox Gallery
  const previewGrid = document.getElementById('preview-gallery-grid');
  if (previewGrid) {
    previewGrid.innerHTML = STORE_CONFIG.PREVIEW_IMAGES.map((p, idx) => `
      <div class="preview-tile" data-index="${idx}" tabindex="0" role="button" aria-label="Inspect ${escapeHtml(p.title)}">
        <div class="preview-img-wrap">
          <img src="${p.src}" alt="${escapeHtml(p.title)}" loading="lazy" class="preview-img">
          <div class="preview-overlay">
            <span class="preview-zoom-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
              <span>Click to Preview</span>
            </span>
          </div>
        </div>
        <div class="preview-caption">
          <span class="preview-category">${escapeHtml(p.guideName)}</span>
          <h4 class="preview-title">${escapeHtml(p.title)}</h4>
          <p class="preview-desc">${escapeHtml(p.desc)}</p>
        </div>
      </div>
    `).join('');
  }

  // Render FAQ Accordion
  const faqRoot = document.getElementById('faq-accordion-root');
  if (faqRoot) {
    faqRoot.innerHTML = STORE_CONFIG.FAQ.map((faq, idx) => `
      <div class="accordion-item faq-item">
        <button class="accordion-trigger faq-trigger" aria-expanded="${idx === 0 ? 'true' : 'false'}" aria-controls="faq-ans-${idx}">
          <span class="accordion-title">${escapeHtml(faq.q)}</span>
          <span class="accordion-icon" aria-hidden="true">&plus;</span>
        </button>
        <div id="faq-ans-${idx}" class="accordion-content ${idx === 0 ? 'open' : ''}" role="region">
          <div class="accordion-body">
            <p>${escapeHtml(faq.a)}</p>
          </div>
        </div>
      </div>
    `).join('');
  }
}

/**
 * Mobile Navigation Toggle
 */
function initMobileMenu() {
  const toggleBtn = document.querySelector('.js-mobile-menu-toggle');
  const navMenu = document.querySelector('.js-nav-menu');

  if (!toggleBtn || !navMenu) return;

  const toggle = () => {
    const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
    toggleBtn.setAttribute('aria-expanded', !isExpanded);
    navMenu.classList.toggle('active');
    document.body.classList.toggle('menu-open', !isExpanded);
  };

  toggleBtn.addEventListener('click', toggle);

  // Close when clicking nav links
  navMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      toggleBtn.setAttribute('aria-expanded', 'false');
      navMenu.classList.remove('active');
      document.body.classList.remove('menu-open');
    });
  });
}

/**
 * Carousel for 7 Guide Cards with Silky Smooth Slow Auto-Scrolling
 */
function initCarousel() {
  const track = document.getElementById('guides-carousel-track');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');

  if (!track) return;

  const scrollStepAmount = 310; // width of card (290px) + gap (20px)
  const speedPixelsPerSecond = 30; // Steady, slow readable velocity
  let isPaused = false;
  let resumeTimer = null;
  let lastTimestamp = 0;
  let virtualScrollLeft = track.scrollLeft;

  // Drag-to-scroll variables
  let isPointerDown = false;
  let startX = 0;
  let startScrollLeft = 0;
  let hasDragged = false;

  function pauseAutoScroll(duration = null) {
    isPaused = true;
    if (resumeTimer) clearTimeout(resumeTimer);
    if (duration) {
      resumeTimer = setTimeout(() => {
        isPaused = false;
      }, duration);
    }
  }

  function resumeAutoScroll(delay = 600) {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      virtualScrollLeft = track.scrollLeft;
      isPaused = false;
    }, delay);
  }

  // Calculate the pixel width of one full set of guides (before cloned set)
  function getSingleSetWidth() {
    const totalGuides = STORE_CONFIG.GUIDES ? STORE_CONFIG.GUIDES.length : 7;
    if (track.children.length > totalGuides) {
      const firstCard = track.children[0];
      const cloneCard = track.children[totalGuides];
      if (firstCard && cloneCard) {
        return cloneCard.offsetLeft - firstCard.offsetLeft;
      }
    }
    return Math.floor(track.scrollWidth / 3) || 1;
  }

  // Keep virtual scroll position synchronized if native scroll changes significantly
  track.addEventListener('scroll', () => {
    if (isPointerDown || isPaused) {
      virtualScrollLeft = track.scrollLeft;
    }
  }, { passive: true });

  // Continuous animation frame loop
  function autoScrollLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
    lastTimestamp = timestamp;

    if (!isPaused && !isPointerDown && track.scrollWidth > track.clientWidth) {
      const setWidth = getSingleSetWidth();
      if (setWidth > 0) {
        virtualScrollLeft += speedPixelsPerSecond * deltaSeconds;
        // Seamless infinite reset without visual jump
        if (virtualScrollLeft >= setWidth) {
          virtualScrollLeft -= setWidth;
        }
        track.scrollLeft = virtualScrollLeft;
      }
    }

    requestAnimationFrame(autoScrollLoop);
  }

  // Start slow auto scrolling
  requestAnimationFrame(autoScrollLoop);

  // Pause on hover
  track.addEventListener('mouseenter', () => pauseAutoScroll());
  track.addEventListener('mouseleave', () => {
    if (!isPointerDown) resumeAutoScroll(500);
  });

  // Touch interactions
  track.addEventListener('touchstart', () => pauseAutoScroll(), { passive: true });
  track.addEventListener('touchend', () => resumeAutoScroll(1000));
  track.addEventListener('touchcancel', () => resumeAutoScroll(1000));

  // Accessibility: pause when focused with keyboard
  track.addEventListener('focusin', () => pauseAutoScroll());
  track.addEventListener('focusout', () => resumeAutoScroll(800));

  // Tab visibility handling
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseAutoScroll();
    } else {
      lastTimestamp = 0;
      virtualScrollLeft = track.scrollLeft;
      resumeAutoScroll(600);
    }
  });

  // Desktop Pointer Drag-to-Scroll
  track.addEventListener('pointerdown', (e) => {
    // Only drag with primary mouse button or touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    isPointerDown = true;
    hasDragged = false;
    startX = e.pageX;
    startScrollLeft = track.scrollLeft;
    virtualScrollLeft = track.scrollLeft;
    pauseAutoScroll();
  });

  window.addEventListener('pointermove', (e) => {
    if (!isPointerDown) return;
    const deltaX = e.pageX - startX;
    if (Math.abs(deltaX) > 4) {
      hasDragged = true;
      track.classList.add('is-dragging');
    }
    const targetScroll = startScrollLeft - deltaX;
    track.scrollLeft = targetScroll;
    virtualScrollLeft = targetScroll;
  });

  const stopPointerDrag = (e) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    track.classList.remove('is-dragging');
    virtualScrollLeft = track.scrollLeft;
    // If dragged significantly, prevent accidental card button clicks
    if (hasDragged && e) {
      e.preventDefault();
    }
    resumeAutoScroll(1000);
  };

  window.addEventListener('pointerup', stopPointerDrag);
  window.addEventListener('pointercancel', stopPointerDrag);

  // Arrow navigation buttons
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      pauseAutoScroll(2500);
      const setWidth = getSingleSetWidth();
      if (track.scrollLeft <= 10 && setWidth > 0) {
        virtualScrollLeft += setWidth;
        track.scrollLeft = virtualScrollLeft;
      }
      virtualScrollLeft = Math.max(0, virtualScrollLeft - scrollStepAmount);
      track.scrollBy({ left: -scrollStepAmount, behavior: 'smooth' });
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      pauseAutoScroll(2500);
      const setWidth = getSingleSetWidth();
      if (setWidth > 0 && virtualScrollLeft >= setWidth * 2) {
        virtualScrollLeft -= setWidth;
        track.scrollLeft = virtualScrollLeft;
      }
      virtualScrollLeft += scrollStepAmount;
      track.scrollBy({ left: scrollStepAmount, behavior: 'smooth' });
    });
  }

  // Keyboard navigation on track
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      pauseAutoScroll(2500);
      virtualScrollLeft += scrollStepAmount;
      track.scrollBy({ left: scrollStepAmount, behavior: 'smooth' });
    } else if (e.key === 'ArrowLeft') {
      pauseAutoScroll(2500);
      virtualScrollLeft = Math.max(0, virtualScrollLeft - scrollStepAmount);
      track.scrollBy({ left: -scrollStepAmount, behavior: 'smooth' });
    }
  });

  // Listen for "Chapters" button inside card to jump to chapter accordion
  track.addEventListener('click', (e) => {
    if (hasDragged) {
      e.stopPropagation();
      return;
    }
    const btn = e.target.closest('.js-view-chapters');
    if (!btn) return;
    const guideId = btn.getAttribute('data-guide-id');
    const targetItem = document.getElementById(`accordion-${guideId}`);
    if (targetItem) {
      targetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const trigger = targetItem.querySelector('.accordion-trigger');
      const content = targetItem.querySelector('.accordion-content');
      if (trigger && content && !content.classList.contains('open')) {
        trigger.setAttribute('aria-expanded', 'true');
        content.classList.add('open');
      }
    }
  });
}

/**
 * Chapter Accordion interactions
 */
function initChapterAccordions() {
  const root = document.getElementById('chapters-accordion-root');
  if (!root) return;

  root.addEventListener('click', (e) => {
    const trigger = e.target.closest('.chapter-trigger');
    if (!trigger) return;

    const content = trigger.nextElementSibling;
    const isOpen = content.classList.contains('open');

    // Toggle current
    trigger.setAttribute('aria-expanded', !isOpen);
    content.classList.toggle('open', !isOpen);
  });
}

/**
 * FAQ Accordion interactions
 */
function initFaqAccordion() {
  const root = document.getElementById('faq-accordion-root');
  if (!root) return;

  root.addEventListener('click', (e) => {
    const trigger = e.target.closest('.faq-trigger');
    if (!trigger) return;

    const content = trigger.nextElementSibling;
    const isOpen = content.classList.contains('open');

    // Close others
    root.querySelectorAll('.accordion-trigger').forEach(t => t.setAttribute('aria-expanded', 'false'));
    root.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('open'));

    // Open target if was not open
    if (!isOpen) {
      trigger.setAttribute('aria-expanded', 'true');
      content.classList.add('open');
    }
  });
}

/**
 * Accessible Lightbox Gallery for Preview Mockups
 */
function initLightbox() {
  const grid = document.getElementById('preview-gallery-grid');
  const modal = document.getElementById('lightbox-modal');
  if (!grid || !modal) return;

  const modalImg = modal.querySelector('.lightbox-img');
  const modalTitle = modal.querySelector('.lightbox-title');
  const modalDesc = modal.querySelector('.lightbox-desc');
  const closeBtn = modal.querySelector('.lightbox-close');
  const prevBtn = modal.querySelector('.lightbox-prev');
  const nextBtn = modal.querySelector('.lightbox-next');

  let currentIndex = 0;

  const openLightbox = (index) => {
    currentIndex = index;
    const item = STORE_CONFIG.PREVIEW_IMAGES[currentIndex];
    if (!item) return;

    modalImg.src = item.src;
    modalImg.alt = item.title;
    modalTitle.textContent = item.title;
    modalDesc.textContent = item.desc;

    modal.classList.add('active');
    document.body.classList.add('modal-open');
    closeBtn.focus();
  };

  const closeLightbox = () => {
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
  };

  grid.addEventListener('click', (e) => {
    const tile = e.target.closest('.preview-tile');
    if (tile) {
      const idx = parseInt(tile.getAttribute('data-index'), 10);
      openLightbox(idx);
    }
  });

  grid.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const tile = e.target.closest('.preview-tile');
      if (tile) {
        e.preventDefault();
        const idx = parseInt(tile.getAttribute('data-index'), 10);
        openLightbox(idx);
      }
    }
  });

  closeBtn.addEventListener('click', closeLightbox);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeLightbox();
  });

  prevBtn.addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + STORE_CONFIG.PREVIEW_IMAGES.length) % STORE_CONFIG.PREVIEW_IMAGES.length;
    openLightbox(currentIndex);
  });

  nextBtn.addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % STORE_CONFIG.PREVIEW_IMAGES.length;
    openLightbox(currentIndex);
  });

  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') prevBtn.click();
    if (e.key === 'ArrowRight') nextBtn.click();
  });
}

/**
 * Connect all "Buy Now" CTA buttons to startCheckout()
 */
function bindCheckoutButtons() {
  document.querySelectorAll('.js-buy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      startCheckout(btn);
    });
  });
}

/**
 * Smooth scrolling for in-page anchors
 */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#' || !targetId) return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}

/**
 * Toggle sticky mobile bottom bar when scrolled past the hero
 */
function initStickyBar() {
  const bar = document.querySelector('.sticky-mobile-bar');
  if (!bar) return;

  const handleScroll = () => {
    if (window.scrollY > 350) {
      bar.classList.add('visible');
    } else {
      bar.classList.remove('visible');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
