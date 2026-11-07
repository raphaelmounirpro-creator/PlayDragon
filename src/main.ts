import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import './style.css';
import { Game } from './game/game';
import { setupUpdateNotice } from './ui/updateNotice';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');
new Game(container).run();
setupUpdateNotice();
