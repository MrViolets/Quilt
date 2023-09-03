'use strict'

/* global chrome */

export const displayGetInfo = promisifyChromeMethod(chrome.system.display.getInfo.bind(chrome.system.display))
export const menusCreate = promisifyChromeMethod(chrome.contextMenus.create.bind(chrome.contextMenus))
export const menusUpdate = promisifyChromeMethod(chrome.contextMenus.update.bind(chrome.contextMenus))
export const menusRemoveAll = promisifyChromeMethod(chrome.contextMenus.removeAll.bind(chrome.contextMenus))
export const storageSessionSet = promisifyChromeMethod(chrome.storage.session.set.bind(chrome.storage.session))
export const storageSessionGet = promisifyChromeMethod(chrome.storage.session.get.bind(chrome.storage.session))
export const storageSessionRemove = promisifyChromeMethod(chrome.storage.session.remove.bind(chrome.storage.session))
export const storageLocalGet = promisifyChromeMethod(chrome.storage.local.get.bind(chrome.storage.local))
export const storageLocalSet = promisifyChromeMethod(chrome.storage.local.set.bind(chrome.storage.local))
export const tabsCreate = promisifyChromeMethod(chrome.tabs.create.bind(chrome.tabs))
export const windowsGetAll = promisifyChromeMethod(chrome.windows.getAll.bind(chrome.windows))
export const windowsGet = promisifyChromeMethod(chrome.windows.get.bind(chrome.windows))
export const windowsUpdate = promisifyChromeMethod(chrome.windows.update.bind(chrome.windows))

function promisifyChromeMethod (method) {
  return (...args) =>
    new Promise((resolve, reject) => {
      method(...args, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || JSON.stringify(chrome.runtime.lastError)))
        } else {
          resolve(result)
        }
      })
    })
}
