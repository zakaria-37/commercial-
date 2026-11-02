/* Pont minimal et sûr entre la page et le logiciel : la page peut seulement demander qu'on lui rende le clavier
   (contournement d'un défaut de Windows : après confirm() / alert(), on ne peut plus écrire dans les cases). */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mariabagPC', { rendreClavier: () => ipcRenderer.send('rendre-clavier') });
