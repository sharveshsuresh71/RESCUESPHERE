import { AppController } from './core/AppController';

const app = new AppController(document.getElementById('app') as HTMLElement);
app.start();
