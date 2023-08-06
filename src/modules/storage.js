'use strict'

/* global chrome */

export const preferenceDefaults = {
  auto_tiling: {
    title: chrome.i18n.getMessage('MENU_ENABLED'),
    value: true,
    type: 'checkbox'
  },
  master_window: {
    title: chrome.i18n.getMessage('MENU_MAIN_WINDOW'),
    value: 'none',
    type: 'radio',
    options: ['start', 'end', 'none']
  },
  master_ratio: {
    title: chrome.i18n.getMessage('MENU_MAIN_WINDOW_RATIO'),
    value: '50%',
    type: 'radio',
    options: ['33%', '50%', '66%']
  },
  padding: {
    title: chrome.i18n.getMessage('MENU_PADDING'),
    value: '10',
    type: 'radio',
    options: ['10', '20', '30', 'none']
  }
}

export function save (key, value) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(
      {
        [key]: value
      },
      function () {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message)
        }
        resolve()
      }
    )
  })
}

export function load (key, defaults) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(
      {
        [key]: defaults
      },
      function (value) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message)
        }
        resolve(value[key])
      }
    )
  })
}

export function clear (key) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.remove(key, function () {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message)
      }
      resolve()
    })
  })
}

export function saveSession (key, value) {
  return new Promise((resolve, reject) => {
    chrome.storage.session.set(
      {
        [key]: value
      },
      function () {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message)
        }
        resolve()
      }
    )
  })
}

export function loadSession (key, defaults) {
  return new Promise((resolve, reject) => {
    chrome.storage.session.get(
      {
        [key]: defaults
      },
      function (value) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message)
        }
        resolve(value[key])
      }
    )
  })
}

export function clearSession (key) {
  return new Promise((resolve, reject) => {
    chrome.storage.session.remove(key, function () {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message)
      }
      resolve()
    })
  })
}
