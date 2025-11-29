document.getElementById('hamburger').addEventListener('click', function () {
    this.classList.toggle('active');
    document.getElementById('navLinks').classList.toggle('active');
});

// Close menu when clicking outside
document.addEventListener('click', function (event) {
    const navLinks = document.getElementById('navLinks');
    const hamburger = document.getElementById('hamburger');

    if (navLinks.classList.contains('active') &&
        !event.target.closest('#navLinks') &&
        !event.target.closest('#hamburger')) {
        navLinks.classList.remove('active');
        hamburger.classList.remove('active');
    }
});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});
// // Preloader JavaScript
// window.addEventListener('load', () => {
//     const preloader = document.getElementById('preloader');
//     if (preloader) {
//         // Optional: Prevent body scrolling during preloader display
//         document.body.classList.add('no-scroll');

//         // Set a minimum display time for the preloader (e.g., 2.5 seconds)
//         // This ensures users see the animation even on fast connections.
//         setTimeout(() => {
//             preloader.classList.add('fade-out'); // Start fade-out
//             preloader.addEventListener('transitionend', () => {
//                 preloader.style.display = 'none'; // Hide completely after transition
//                 document.body.classList.remove('no-scroll'); // Re-enable scrolling
//             }, { once: true }); // Ensure listener runs only once
//         }, 5000); // 2500 milliseconds = 2.5 seconds
//     }
// });

(function () {
    const grid = document.currentScript.previousElementSibling.previousElementSibling.querySelector('div[style*="grid-template-columns:2fr"]');
    if (!grid) return;
    function apply() {
        if (window.innerWidth <= 980) {
            grid.style.gridTemplateColumns = '1fr';
        } else {
            grid.style.gridTemplateColumns = '2fr 1.2fr';
        }
    }
    apply(); window.addEventListener('resize', apply);
})();
