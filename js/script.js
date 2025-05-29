// UI Elements
const hamburger = document.querySelector(".hamburger")
const mobileNav = document.querySelector(".mobile-nav")
const closeMenu = document.querySelector(".close-menu")
const overlay = document.querySelector(".overlay")
const navLinks = document.querySelectorAll(".nav-link")
const ctaButtons = document.querySelectorAll(".cta-primary, .cta-secondary")
const languageDropdown = document.querySelector(".language-dropdown")

// Mobile Menu Functions
function toggleMobileMenu() {
  const isExpanded = mobileNav.classList.contains("active")
  mobileNav.classList.toggle("active")
  overlay.classList.toggle("active")
  document.body.classList.toggle("no-scroll")
  hamburger.setAttribute("aria-expanded", !isExpanded)
  
  // Trap focus within mobile menu when open
  if (!isExpanded) {
    // Focus the first focusable element
    const focusableElements = mobileNav.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    if (focusableElements.length) focusableElements[0].focus()
  }
}

function closeMenuFunction() {
  mobileNav.classList.remove("active")
  overlay.classList.remove("active")
  document.body.classList.remove("no-scroll")
  hamburger.setAttribute("aria-expanded", false)
  // Return focus to hamburger button
  hamburger.focus()
}

// Keyboard Navigation
function handleKeyboardNavigation(e) {
  if (e.key === "Escape") {
    if (mobileNav.classList.contains("active")) {
      closeMenuFunction()
    }
    if (languageBtn.getAttribute("aria-expanded") === "true") {
      toggleLanguageDropdown()
    }
  }
}

// Initialize Everything When DOM is Loaded
document.addEventListener("DOMContentLoaded", () => {
  // Initialize Mobile Menu
  if (hamburger && closeMenu && overlay) {
    hamburger.addEventListener("click", toggleMobileMenu)
    closeMenu.addEventListener("click", closeMenuFunction)
    overlay.addEventListener("click", closeMenuFunction)
  }


  // Add keyboard navigation
  document.addEventListener("keydown", handleKeyboardNavigation)

  // Close language dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".language-selector") && languageBtn.getAttribute("aria-expanded") === "true") {
      toggleLanguageDropdown()
    }
  })
})

// Add loading="lazy" to images below the fold
document.addEventListener("DOMContentLoaded", () => {
  const images = document.querySelectorAll("img")
  images.forEach(img => {
    if (!img.hasAttribute("loading") && !isInViewport(img)) {
      img.setAttribute("loading", "lazy")
    }
  })
})

// Helper function to check if element is in viewport
function isInViewport(element) {
  const rect = element.getBoundingClientRect()
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  )
}
