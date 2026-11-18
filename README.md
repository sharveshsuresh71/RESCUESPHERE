# RescueSphere template (Flashform-style, with 3D and effects)

Files
- index.html: all sections and copy
- styles.css: colours, type and layout. Change the variables at the top of :root to re-theme.
- script.js: petal burst animation, FAQ accordion, scroll reveal, demo sign-up.

Use it
1. Unzip, then open index.html in any browser. No build step.
2. Replace the copy in index.html with your own.
3. Connect the sign-up form (#joinForm) to your email service. The demo only shows a message.

Notes
- Fonts load from Google Fonts. Work offline and the page falls back to system fonts.
- The petal animation is drawn on a canvas and stops when off-screen. It is still under reduced motion.
- Room safety copy is a planning aid. Verify dimensions with a tape measure.

3D and effects
- One full-page three.js stage. Each section has its own 3D model that grows in as you scroll to it.
- 3D room: scroll orbits the camera; the escape route pulses toward the exit.
- Effects: letter reveals, scroll progress bar, cursor spotlight, tilting cards, magnetic buttons, parallax headings.
- three.js loads from cdnjs (r128). Needs internet on first load.
