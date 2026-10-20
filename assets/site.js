// Effets du site vitrine : barre sur l'écran noir, scène centrale (le
// téléphone épinglé dont l'écran suit l'étape lue), clips lus seulement à
// l'écran, bascule hôte / invité du bento, apparitions. Rien ne part du
// navigateur : aucune requête, aucun stockage. Tout s'arrête devant
// prefers-reduced-motion, et la page reste lisible sans JavaScript.
//
// Chargé dans <head> sans attendre : la classe `js` se pose avant le premier
// affichage, pour que la scène ne saute pas d'une mise en page à l'autre.
document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const light = window.matchMedia('(prefers-color-scheme: light)');
  const observe = 'IntersectionObserver' in window;

  // Barre : noire tant que l'écran de l'allumage est sous elle.
  const nav = document.querySelector('.nav');
  const hero = document.querySelector('.hero');
  if (nav && hero) {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        nav.classList.toggle('over-screen', hero.getBoundingClientRect().bottom > nav.offsetHeight);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  // Apparitions au défilement.
  const revealed = document.querySelectorAll('[data-reveal]');
  if (still || !observe) {
    revealed.forEach((el) => el.classList.add('visible'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealed.forEach((el) => io.observe(el));
  }

  // Bouton lecture et pause d'une vidéo en boucle (WCAG 2.2.2).
  const render = (toggle, video) => {
    if (!toggle) return;
    const playing = video && !video.paused;
    toggle.dataset.state = playing ? 'playing' : 'paused';
    toggle.setAttribute('aria-label', playing ? toggle.dataset.pause : toggle.dataset.play);
  };
  const play = (video, onFail) => {
    const promise = video.play();
    if (promise) promise.catch(onFail);
  };

  // Clips seuls (haut de page, bande-annonce) : lus à l'écran, jamais seuls
  // si le système demande moins de mouvement, toujours avec leur bouton.
  document.querySelectorAll('.hero-phone, .trailer-wrap').forEach((box) => {
    const video = box.querySelector('video');
    const toggle = box.querySelector('.demo-toggle');
    if (!video) return;
    let pausedByUser = still;
    video.addEventListener('play', () => render(toggle, video));
    video.addEventListener('pause', () => render(toggle, video));
    toggle?.addEventListener('click', () => {
      if (video.paused) { pausedByUser = false; play(video, () => render(toggle, video)); } else { pausedByUser = true; video.pause(); }
    });
    if (observe) {
      new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !pausedByUser) play(video, () => render(toggle, video));
        if (!entry.isIntersecting) video.pause();
      }, { threshold: 0.25 }).observe(video);
    } else if (!pausedByUser) {
      play(video, () => render(toggle, video));
    }
    render(toggle, video);
  });

  // Scène centrale : chaque repère invisible, en passant au milieu de
  // l'écran, allume sa phrase et l'écran de son étape.
  const story = document.querySelector('.story');
  if (story && observe) {
    const phrases = Array.from(story.querySelectorAll('.phrase'));
    const dots = Array.from(story.querySelectorAll('.dot'));
    const markers = Array.from(story.querySelectorAll('.marker'));
    const all = Array.from(story.querySelectorAll('.stage-phone video'));
    const toggle = story.querySelector('.stage-toggle');
    // L'écran d'une étape : sa version claire quand l'appareil le demande.
    const screenOf = (step) => {
      const candidates = all.filter((v) => Number(v.dataset.step) === step);
      return candidates.find((v) => v.classList.contains(light.matches ? 'only-light' : 'only-dark'))
        || candidates.find((v) => !v.classList.contains('only-light') && !v.classList.contains('only-dark'))
        || candidates[0];
    };
    let current = -1;
    let inView = false;
    let pausedByUser = still;
    const prime = (step) => {
      const video = screenOf(step);
      if (!video) return;
      if (video.dataset.poster && !video.poster) video.poster = video.dataset.poster;
      if (video.preload === 'none') video.preload = 'metadata';
    };
    const sync = () => {
      const active = screenOf(current);
      all.forEach((video) => {
        if (video !== active && !video.paused) video.pause();
      });
      if (active && inView && !pausedByUser) {
        play(active, () => render(toggle, active));
      } else if (active) {
        active.pause();
      }
      render(toggle, active);
    };
    const show = (step) => {
      if (step === current) return;
      current = step;
      const active = screenOf(step);
      phrases.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.step) === step));
      dots.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.step) === step));
      all.forEach((video) => video.classList.toggle('is-active', video === active));
      [step, step + 1, step - 1].forEach(prime);
      if (active) active.currentTime = 0;
      sync();
    };
    all.forEach((video) => {
      video.addEventListener('play', () => { if (video === screenOf(current)) render(toggle, video); });
      video.addEventListener('pause', () => { if (video === screenOf(current)) render(toggle, video); });
    });
    toggle?.addEventListener('click', () => {
      const active = screenOf(current);
      if (!active) return;
      pausedByUser = !active.paused;
      sync();
    });
    const markerObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) show(Number(entry.target.dataset.step));
      });
    }, { rootMargin: '-50% 0px -50% 0px' });
    markers.forEach((marker) => markerObserver.observe(marker));
    // La scène ne joue que tant qu'elle est à l'écran.
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    }, { threshold: 0.2 }).observe(story.querySelector('.stage'));
    light.addEventListener?.('change', () => {
      const step = current;
      current = -1;
      show(step < 0 ? 0 : step);
    });
    show(0);
  }

  // Bento : la bascule hôte / invité, en onglets (flèches comprises).
  const tabs = Array.from(document.querySelectorAll('.switch [role="tab"]'));
  const select = (tab, focus) => {
    tabs.forEach((other) => {
      const on = other === tab;
      other.setAttribute('aria-selected', String(on));
      other.tabIndex = on ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab, false));
    tab.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      select(tabs[(index + step + tabs.length) % tabs.length], true);
    });
  });
  if (tabs.length) select(tabs[0], false);
});
