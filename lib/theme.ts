// Shared by the theme switch (client) and the layout (server).
export const THEME_KEY = "gilt-monitor:theme";

/** Runs before paint (inlined in <head>) so a saved theme never flashes the wrong colours. */
export const themeBootScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
