import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import './light-theme.css'
import { loadTheme } from './app-theme'

// Apply the saved palette before mounting any interface to avoid a light-theme flash.
document.documentElement.dataset.theme = loadTheme(window.localStorage)

const target = document.getElementById('app')
if (!target) throw new Error('Renderer root not found')
mount(App, { target })
