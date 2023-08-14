'use strict'

/* global chrome */

import * as display from './modules/display.js'
import * as menu from './modules/menu.js'
import * as storage from './modules/storage.js'
import * as tabs from './modules/tabs.js'
import * as windows from './modules/windows.js'

chrome.runtime.onInstalled.addListener(init)
chrome.runtime.onStartup.addListener(init)
chrome.contextMenus.onClicked.addListener(onMenuClicked)
chrome.windows.onCreated.addListener(onWindowCreated, { windowType: ['normal'] })
chrome.windows.onRemoved.addListener(onWindowRemoved, { windowType: ['normal'] })
chrome.windows.onBoundsChanged.addListener(onWindowBoundsChanged)
chrome.system.display.onDisplayChanged.addListener(onDisplaysChanged)
chrome.commands.onCommand.addListener(onCommandReceived)

async function init () {
  await countConnectedDisplays()
  await setupContextMenu()
  await loadPreferences()
}

async function countConnectedDisplays () {
  const allDisplays = await display.getDisplayInfo().catch(error => {
    console.error(error)
    return 1
  })

  const numConnectedDisplays = allDisplays.length

  try {
    await storage.saveSession('number-of-displays', numConnectedDisplays)
  } catch (error) {
    console.error(error)
  }
}

async function setupContextMenu () {
  const userPreferences = await storage.load('preferences', storage.preferenceDefaults).catch(error => {
    console.error(error)
    return storage.preferenceDefaults
  })
  const menuItemsFromPreferences = buildMenuStructureFromPreferences(userPreferences)
  const allDisplays = await display.getDisplayInfo().catch(error => {
    console.error(error)
    return null
  })

  if (!allDisplays) return

  const hasMultipleDisplays = allDisplays.length > 1

  const menuItems = [
    {
      title: chrome.i18n.getMessage('MENU_TILE_NOW'),
      contexts: ['action', 'page'],
      id: 'tile_now',
      type: 'normal'
    }
  ]

  if (hasMultipleDisplays) {
    // Add the children menu items only if there are multiple displays
    menuItems.push(
      {
        title: chrome.i18n.getMessage('MENU_TILE_NOW_CURRENT'),
        contexts: ['action', 'page'],
        id: 'tile_now_current',
        type: 'normal',
        parentId: 'tile_now'
      },
      {
        title: chrome.i18n.getMessage('MENU_TILE_NOW_ALL'),
        contexts: ['action', 'page'],
        id: 'tile_now_all',
        type: 'normal',
        parentId: 'tile_now'
      }
    )
  }

  const menuItemsWithSeparators = [
    ...menuItems,
    {
      contexts: ['action', 'page'],
      id: 'separator_1',
      type: 'separator'
    },
    ...menuItemsFromPreferences,
    {
      contexts: ['action', 'page'],
      id: 'separator_2',
      type: 'separator'
    },
    {
      title: chrome.i18n.getMessage('MENU_RATE'),
      contexts: ['action', 'page'],
      id: 'rate_extension',
      type: 'normal'
    },
    {
      title: chrome.i18n.getMessage('MENU_DONATE'),
      contexts: ['action', 'page'],
      id: 'donate',
      type: 'normal'
    }
  ]

  try {
    await menu.create(menuItemsWithSeparators)
  } catch (error) {
    console.error(error)
  }
}

function buildMenuStructureFromPreferences (preferences) {
  const menuStructure = [
    {
      title: chrome.i18n.getMessage('MENU_PREFERENCES'),
      contexts: ['action', 'page'],
      id: 'preferences',
      type: 'normal'
    }
  ]

  let i = 0

  for (const key in preferences) {
    const menuItem = getMenuItem(preferences[key], key)
    menuStructure.push(...menuItem)

    if (i === 0) {
      const separator = getSeparatorMenuItem('preferences')
      menuStructure.push(separator)
    }
    i++
  }

  return menuStructure
}

function getMenuItem (preference, key) {
  const temp = []

  if (preference.type === 'checkbox') {
    const menuItem = {
      title: preference.title,
      contexts: ['action', 'page'],
      id: key,
      type: 'checkbox',
      parentId: 'preferences'
    }

    temp.push(menuItem)
  }

  if (preference.type === 'radio') {
    const parentItem = {
      title: preference.title,
      contexts: ['action', 'page'],
      id: key,
      type: 'normal',
      parentId: 'preferences'
    }

    temp.push(parentItem)

    for (const option of preference.options) {
      const childItem = {
        title: option.charAt(0).toUpperCase() + option.slice(1),
        contexts: ['action', 'page'],
        id: `${key}.${option}`,
        type: 'radio',
        parentId: key
      }

      temp.push(childItem)
    }
  }

  return temp
}

function getSeparatorMenuItem (parentId) {
  return {
    contexts: ['action', 'page'],
    id: `separator_${parentId}`,
    type: 'separator',
    parentId
  }
}

async function loadPreferences () {
  const userPreferences = await storage.load('preferences', storage.preferenceDefaults).catch(error => {
    console.error(error)
    return storage.preferenceDefaults
  })

  try {
    for (const [preferenceName, preferenceObj] of Object.entries(userPreferences)) {
      if (preferenceObj.type === 'radio') {
        await menu.update(`${preferenceName}.${preferenceObj.value}`, true)
      } else if (preferenceObj.type === 'checkbox') {
        await menu.update(preferenceName, preferenceObj.value)
      }
    }
  } catch (error) {
    console.error(error)
  }
}

async function onDisplaysChanged () {
  await setupContextMenu()
  await loadPreferences()

  const userPreferences = await storage.load('preferences', storage.preferenceDefaults).catch(error => {
    console.error(error)
    return storage.preferenceDefaults
  })

  if (userPreferences.auto_tiling.value === false) {
    return
  }

  const allDisplays = await display.getDisplayInfo().catch(error => {
    console.error(error)
    return null
  })

  if (!allDisplays) return

  const newNumConnectedDisplays = allDisplays.length
  const oldNumConnectedDisplays = await storage.loadSession('number-of-displays', 1).catch(error => {
    console.error(error)
    return 1
  })

  // If the number if displays has changed then update the tiling
  if (oldNumConnectedDisplays !== newNumConnectedDisplays) {
    await tileAllDisplays()

    try {
      await storage.saveSession('number-of-displays', newNumConnectedDisplays)
    } catch (error) {
      console.error(error)
    }
  }
}

async function onMenuClicked (info, tab) {
  const { menuItemId, parentMenuItemId, checked } = info

  if (storage.preferenceDefaults[menuItemId] || storage.preferenceDefaults[parentMenuItemId ?? '']) {
    const userPreferences = await storage.load('preferences', storage.preferenceDefaults).catch(error => {
      console.error(error)
      return storage.preferenceDefaults
    })
    const preference = userPreferences[menuItemId]
    const parentPreference = userPreferences[parentMenuItemId ?? '']

    if (parentPreference && parentPreference.type === 'radio') {
      parentPreference.value = menuItemId.split('.')[1]
    } else if (preference.type === 'checkbox') {
      preference.value = checked
    }

    try {
      await storage.save('preferences', userPreferences)
    } catch (error) {
      console.error(error)
    }

    if (['master_window', 'padding'].includes(parentMenuItemId) && userPreferences.auto_tiling.value === true) {
      await retileTiledDisplays()
    }
  }

  if (menuItemId === 'tile_now_current') {
    const win = await windows.get(tab.windowId)
    await tileDisplayByWin(win)
  } else if ((menuItemId === 'auto_tiling' && checked) || menuItemId === 'tile_now' || menuItemId === 'tile_now_all' || parentMenuItemId === 'master_ratio') {
    await tileAllDisplays()
  } else if (menuItemId === 'auto_tiling' && !checked) {
    await storage.clearSession('tiled-windows')
  } else if (menuItemId === 'rate_extension' || menuItemId === 'donate') {
    await openExternal(menuItemId)
  }
}

async function tileAllDisplays () {
  const allDisplays = await display.getDisplayInfo().catch(error => {
    console.error(error)
    return null
  })

  if (!allDisplays) return

  if (allDisplays.length === 1) {
    await tileWindows(allDisplays, allDisplays[0])
  } else {
    for (const d of allDisplays) {
      await tileWindows(allDisplays, d)
    }
  }
}

async function tileDisplayByWin (win) {
  const allDisplays = await display.getDisplayInfo().catch(error => {
    console.error(error)
    return null
  })

  if (!allDisplays) return

  const targetDisplay = getDisplayContainingWindow(allDisplays, win)
  await tileWindows(allDisplays, targetDisplay)
}

async function retileTiledDisplays () {
  const allDisplays = await display.getDisplayInfo().catch(error => {
    console.error(error)
    return null
  })

  if (!allDisplays) return

  if (allDisplays.length === 1) {
    await tileWindows(allDisplays, allDisplays[0])
    return
  }

  const tiledWindows = await storage.loadSession('tiled-windows', []).catch(error => {
    console.error(error)
    return []
  })

  if (tiledWindows.length === 0) return

  const commonDisplayIds = [...new Set(tiledWindows.map((window) => window.displayId))]
  const displaysToBeTiled = allDisplays.filter((display) => commonDisplayIds.includes(display.id))

  for (const d of displaysToBeTiled) {
    await tileWindows(allDisplays, d)
  }
}

async function onWindowCreated (win) {
  if (win.type !== 'normal') {
    return
  }

  const userPreferences = await storage.load('preferences', storage.preferenceDefaults).catch(error => {
    console.error(error)
    return storage.preferenceDefaults
  })

  if (userPreferences.auto_tiling.value === false) {
    return
  }

  const allDisplays = await display.getDisplayInfo().catch(error => {
    console.error(error)
    return null
  })

  if (!allDisplays) return

  const targetDisplay = getDisplayContainingWindow(allDisplays, win)
  await tileWindows(allDisplays, targetDisplay)
}

async function onWindowRemoved (winId) {
  const userPreferences = await storage.load('preferences', storage.preferenceDefaults).catch(error => {
    console.error(error)
    return storage.preferenceDefaults
  })

  if (userPreferences.auto_tiling.value === false) {
    return
  }

  const tiledWindows = await storage.loadSession('tiled-windows', []).catch(error => {
    console.error(error)
    return []
  })

  if (tiledWindows.length === 0) return

  const indexOfRemovedWindow = tiledWindows.findIndex((w) => w.winId === winId)
  const targetWindow = tiledWindows[indexOfRemovedWindow]

  if (!targetWindow) {
    return
  }

  const tiledWindowsOnDisplay = tiledWindows.filter((w) => w.displayId === targetWindow.displayId)

  if (tiledWindowsOnDisplay.length > 0) {
    const allDisplays = await display.getDisplayInfo().catch(error => {
      console.error(error)
      return null
    })

    if (!allDisplays) return

    const targetDisplay = allDisplays.find((d) => d.id === targetWindow.displayId)

    if (targetDisplay) {
      await tileWindows(allDisplays, targetDisplay)
    }
  }

  // If the window ID is found, remove it from the array
  tiledWindows.splice(indexOfRemovedWindow, 1)
  // Save the updated tiledWindows array to storage
  try {
    await storage.saveSession('tiled-windows', tiledWindows)
  } catch (error) {
    console.error(error)
  }
}

async function onWindowBoundsChanged (win) {
  const userPreferences = await storage.load('preferences', storage.preferenceDefaults).catch(error => {
    console.error(error)
    return storage.preferenceDefaults
  })

  if (userPreferences.auto_tiling.value === false) {
    return
  }

  const tiledWindows = await storage.loadSession('tiled-windows', []).catch(error => {
    console.error(error)
    return []
  })
  const targetWindow = tiledWindows.find((w) => w.winId === win.id)

  if (targetWindow && targetWindow.ignoreUpdate === false) {
    // Update the displayId and save to storage
    const allDisplays = await display.getDisplayInfo().catch(error => {
      console.error(error)
      return null
    })

    if (!allDisplays) return

    const displayContainingTargetWindow = getDisplayContainingWindow(allDisplays, win)

    if (displayContainingTargetWindow.id !== targetWindow.displayId) {
      targetWindow.displayId = displayContainingTargetWindow.id
      await storage.saveSession('tiled-windows', tiledWindows)
    }
  }
}

async function onCommandReceived (command) {
  if (command === 'tile-all') {
    await tileAllDisplays()
  }
}

async function tileWindows (allDisplays, targetDisplay) {
  const userPreferences = await storage.load('preferences', storage.preferenceDefaults).catch(error => {
    console.error(error)
    return storage.preferenceDefaults
  })
  const tiledWindows = await storage.loadSession('tiled-windows', []).catch(error => {
    console.error(error)
    return []
  })
  const windowsToBeTiled = await getWindowsToBeTiled(allDisplays, targetDisplay).catch(error => {
    console.error(error)
    return []
  })

  const numWindows = windowsToBeTiled.length

  if (numWindows === 0) {
    return
  }

  const displayObj = getDisplayObj(targetDisplay)
  const padding = getPadding(userPreferences)

  let masterWindowTile = null

  if (numWindows > 1 && userPreferences.master_window.value !== 'none') {
    masterWindowTile = calculateMasterWindowTile(displayObj, userPreferences, padding)

    // Remove the first window in the array to be used as the master window
    const masterWin = windowsToBeTiled.shift()

    // Set the position of the master window
    try {
      await windows.setWindow(masterWin.id, masterWindowTile)
    } catch (error) {
      console.error(error)
    }

    // Update the width to the remaining width excluding the size of the master window
    if (displayObj.orientation === 'landscape') {
      displayObj.width = displayObj.width - masterWindowTile.width - padding
    } else {
      displayObj.height = displayObj.height - masterWindowTile.height - padding
    }

    // Make sure to keep track of master window
    tiledWindows.push({
      winId: masterWin.id,
      displayId: displayObj.id,
      ignoreUpdate: true
    })
  }

  const tilePositions = calculateWindowTiles(displayObj, windowsToBeTiled.length, padding)

  const tileObj = {
    windowsToBeTiled,
    tiledWindows,
    masterWindowTile,
    tilePositions,
    numWindows: windowsToBeTiled.length
  }

  await processTiledWindows(displayObj, tileObj, padding)
}

async function getWindowsToBeTiled (allDisplays, targetDisplay) {
  const allWindows = (await windows.getWindows().catch(e => {
    console.error('Failed to fetch windows:', e)
    return []
  })).filter((win) => win.state !== 'minimized')

  if (allWindows.length === 0) return

  if (allDisplays.length === 1) {
    return allWindows
  } else {
    const windowsToBeTiled = allWindows.filter((candidateWindow) => {
      const containingDisplay = getDisplayContainingWindow(allDisplays, candidateWindow)
      return containingDisplay.id === targetDisplay.id
    })

    return windowsToBeTiled
  }
}

function getDisplayContainingWindow (connectedDisplays, targetWindow) {
  // Get the coordinates of the top-left corner of the target window
  const targetX = targetWindow.left
  const targetY = targetWindow.top

  let selectedDisplay = null
  let maxIntersectionArea = 0

  // Iterate through each display to find the one containing most of the window
  for (const display of connectedDisplays) {
    // Get the coordinates of the left, right, top, and bottom edges of the display
    const displayLeft = display.bounds.left
    const displayRight = display.bounds.left + display.bounds.width
    const displayTop = display.bounds.top
    const displayBottom = display.bounds.top + display.bounds.height

    // Calculate the intersection area between the target window and the current display
    const intersectionLeft = Math.max(targetX, displayLeft)
    const intersectionRight = Math.min(targetX + targetWindow.width, displayRight)
    const intersectionTop = Math.max(targetY, displayTop)
    const intersectionBottom = Math.min(targetY + targetWindow.height, displayBottom)
    const intersectionWidth = intersectionRight - intersectionLeft
    const intersectionHeight = intersectionBottom - intersectionTop

    // Ensure that the intersection area is non-negative
    const intersectionArea = Math.max(0, intersectionWidth) * Math.max(0, intersectionHeight)

    // Update selectedDisplay if the current display contains more of the window
    if (intersectionArea > maxIntersectionArea) {
      selectedDisplay = display
      maxIntersectionArea = intersectionArea
    }
  }

  // Return the display that contains most of the window
  return selectedDisplay
}

function getDisplayObj (targetDisplay) {
  return {
    id: targetDisplay.id,
    top: targetDisplay.workArea.top,
    left: targetDisplay.workArea.left,
    width: targetDisplay.workArea.width,
    height: targetDisplay.workArea.height,
    orientation: targetDisplay.workArea.width > targetDisplay.workArea.height ? 'landscape' : 'portrait'
  }
}

function getPadding (userPreferences) {
  return userPreferences.padding.value === 'none' ? 0 : parseInt(userPreferences.padding.value)
}

function calculateMasterWindowTile (displayObj, userPreferences, padding) {
  const masterWindowTileRatio = percentageToNumber(userPreferences.master_ratio.value)
  const masterWindowTileWidth = Math.floor(displayObj.width * masterWindowTileRatio - 1.5 * padding)
  const masterWindowTileHeight = Math.floor(displayObj.height * masterWindowTileRatio - 1.5 * padding)

  const masterWindowTile = {
    position: userPreferences.master_window.value,
    top: displayObj.top + padding,
    left: displayObj.left + padding,
    width: masterWindowTileWidth,
    height: masterWindowTileHeight
  }

  if (displayObj.orientation === 'landscape') {
    masterWindowTile.height = Math.floor(displayObj.height - padding * 2)

    if (userPreferences.master_window.value === 'end') {
      masterWindowTile.left = displayObj.left + displayObj.width - masterWindowTileWidth - padding
    }
  } else {
    masterWindowTile.width = Math.floor(displayObj.width - padding * 2)

    if (userPreferences.master_window.value === 'end') {
      masterWindowTile.top = displayObj.left + displayObj.height - masterWindowTileHeight - padding
    }
  }

  return masterWindowTile
}

function percentageToNumber (percentageString) {
  const numberString = percentageString.replace('%', '')
  const number = parseFloat(numberString) / 100

  return number
}

async function processTiledWindows (displayObj, tileObj, padding) {
  for (const win of tileObj.windowsToBeTiled) {
    // Check if the window is already in the tiledWindows array
    const windowIndex = tileObj.tiledWindows.findIndex((tiledWindow) => tiledWindow.winId === win.id)
    const targetWindow = tileObj.tiledWindows[windowIndex]

    if (targetWindow) {
      // Used in onWindowBoundsChanged to identify windows that are resized by the extension as opposed to the user
      targetWindow.ignoreUpdate = true
    } else {
      tileObj.tiledWindows.push({
        winId: win.id,
        displayId: displayObj.id,
        ignoreUpdate: true
      })
    }
  }

  for (let i = 0; i < tileObj.windowsToBeTiled.length; i++) {
    const win = tileObj.windowsToBeTiled[i]
    const tile = tileObj.tilePositions[i]

    const currentPosition = {
      top: win.top,
      left: win.left,
      height: win.height,
      width: win.width
    }

    const expectedPosition = {
      top: displayObj.top + tile.top,
      left: displayObj.left + tile.left,
      height: tile.height,
      width: tile.width
    }

    if (tileObj.masterWindowTile) {
      if (tileObj.masterWindowTile.position === 'start') {
        if (displayObj.orientation === 'landscape') {
          expectedPosition.left = displayObj.left + tile.left + tileObj.masterWindowTile.width + padding
        } else if (displayObj.orientation === 'portrait') {
          expectedPosition.top = displayObj.top + tile.top + tileObj.masterWindowTile.height + padding
        }
      }
    }

    // Only set window sizes and positions of windows in the wrong size/place
    if (!compareWindowExpectedSize(expectedPosition, currentPosition)) {
      try {
        await windows.setWindow(win.id, expectedPosition)
      } catch (error) {
        console.error(error)
      }
    }
  }

  for (const tiledWindow of tileObj.tiledWindows) {
    tiledWindow.ignoreUpdate = false
  }

  try {
    await storage.saveSession('tiled-windows', tileObj.tiledWindows)
  } catch (error) {
    console.error(error)
  }
}

function compareWindowExpectedSize (pos1, pos2) {
  const keys1 = Object.keys(pos1)

  for (const key of keys1) {
    if (pos1[key] !== pos2[key]) {
      return false
    }
  }

  return true
}

function calculateWindowTiles (displayObj, numWindows, padding) {
  const effectiveWidth = displayObj.width - 2 * padding
  const effectiveHeight = displayObj.height - 2 * padding

  const minimumColumnWidth = 500

  let numRows
  let numColumns

  if (displayObj.width <= minimumColumnWidth * 2 + 2 * padding) {
    numRows = numWindows
    numColumns = 1
  } else if (numWindows === 2) {
    numRows = displayObj.orientation === 'landscape' ? 1 : 2
    numColumns = displayObj.orientation === 'landscape' ? 2 : 1
  } else {
    numRows = Math.ceil(Math.sqrt(numWindows))
    numColumns = Math.ceil(numWindows / numRows)
  }

  const tileWidth = Math.floor((effectiveWidth - (numColumns - 1) * padding) / numColumns)
  const tileHeight = Math.floor((effectiveHeight - (numRows - 1) * padding) / numRows)

  // Create an array to store the positions and sizes of each tile
  const tilePositions = []

  let x = padding
  let y = padding

  for (let i = 0; i < numWindows; i++) {
    if (i > 0 && i % numColumns === 0) {
      // Move to the next row
      y += tileHeight + padding
      x = padding
    }

    tilePositions.push({ top: y, left: x, width: tileWidth, height: tileHeight })

    x += tileWidth + padding
  }

  return tilePositions
}

async function openExternal (type) {
  let url

  if (type === 'rate_extension') {
    const extensionId = chrome.runtime.id
    url = `https://chrome.google.com/webstore/detail/${extensionId}`
  } else if (type === 'donate') {
    url = 'https://www.buymeacoffee.com/mrviolets'
  }

  try {
    await tabs.create(url)
  } catch (error) {
    console.error(error)
  }
}
