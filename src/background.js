'use strict'

/* global chrome */

import * as ch from './chrome/promisify.js'
import * as preferences from './preferences.js'

chrome.runtime.onInstalled.addListener(onInstalled)
chrome.runtime.onStartup.addListener(onStartup)
chrome.windows.onCreated.addListener(onWindowCreated, { windowType: ['normal'] })
chrome.windows.onRemoved.addListener(onWindowRemoved, { windowType: ['normal'] })
chrome.windows.onBoundsChanged.addListener(onWindowBoundsChanged)
chrome.system.display.onDisplayChanged.addListener(onDisplaysChanged)
chrome.runtime.onMessage.addListener(onMessageReceived)
chrome.commands.onCommand.addListener(onCommandReceived)

async function onInstalled () {
  await countConnectedDisplays()
}

async function onStartup () {
  await countConnectedDisplays()
}

async function countConnectedDisplays () {
  const allDisplays = await ch.displayGetInfo().catch(error => {
    console.error(error)
    return null
  })

  const numConnectedDisplays = allDisplays.length

  try {
    await ch.storageSessionSet({ number_of_displays: numConnectedDisplays })
  } catch (error) {
    console.error(error)
  }
}

async function onDisplaysChanged () {
  if (!await extensionIsEnabled()) return

  const allDisplays = await ch.displayGetInfo().catch(error => {
    console.error(error)
    return null
  })

  if (!allDisplays) return

  const newNumConnectedDisplays = allDisplays.length
  const numDisplaysResult = await ch.storageSessionGet({ number_of_displays: 1 }).catch(error => {
    console.error(error)
    return { number_of_displays: 1 }
  })

  const oldNumConnectedDisplays = numDisplaysResult.number_of_displays

  // If the number if displays has changed then update the tiling
  if (oldNumConnectedDisplays !== newNumConnectedDisplays) {
    await tileAllDisplays()

    try {
      await ch.storageSessionSet({ number_of_displays: newNumConnectedDisplays })
    } catch (error) {
      console.error(error)
    }
  }
}

async function tileAllDisplays () {
  const allDisplays = await ch.displayGetInfo().catch(error => {
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

async function retileTiledDisplays () {
  const allDisplays = await ch.displayGetInfo().catch(error => {
    console.error(error)
    return null
  })

  if (!allDisplays) return

  if (allDisplays.length === 1) {
    await tileWindows(allDisplays, allDisplays[0])
    return
  }

  const winResult = await ch.storageSessionGet({ tiled_windows: [] }).catch(error => {
    console.error(error)
    return { tiled_windows: [] }
  })

  const tiledWindows = winResult.tiled_windows

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

  if (!await extensionIsEnabled()) return

  const allDisplays = await ch.displayGetInfo().catch(error => {
    console.error(error)
    return null
  })

  if (!allDisplays) return

  const targetDisplay = getDisplayContainingWindow(allDisplays, win)
  await tileWindows(allDisplays, targetDisplay)
}

async function onWindowRemoved (winId) {
  if (!await extensionIsEnabled()) return

  const winResult = await ch.storageSessionGet({ tiled_windows: [] }).catch(error => {
    console.error(error)
    return { tiled_windows: [] }
  })

  const tiledWindows = winResult.tiled_windows

  if (tiledWindows.length === 0) return

  const indexOfRemovedWindow = tiledWindows.findIndex((w) => w.winId === winId)
  const targetWindow = tiledWindows[indexOfRemovedWindow]

  if (!targetWindow) {
    return
  }

  const tiledWindowsOnDisplay = tiledWindows.filter((w) => w.displayId === targetWindow.displayId)

  if (tiledWindowsOnDisplay.length > 0) {
    const allDisplays = await ch.displayGetInfo().catch(error => {
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
    await ch.storageLocalSet({ tiled_windows: tiledWindows })
  } catch (error) {
    console.error(error)
  }
}

async function onWindowBoundsChanged (win) {
  if (!await extensionIsEnabled()) return

  const winResult = await ch.storageSessionGet({ tiled_windows: [] }).catch(error => {
    console.error(error)
    return { tiled_windows: [] }
  })

  const tiledWindows = winResult.tiled_windows

  const targetWindow = tiledWindows.find((w) => w.winId === win.id)

  if (targetWindow && targetWindow.ignoreUpdate === false) {
    // Update the displayId and save to storage
    const allDisplays = await ch.displayGetInfo().catch(error => {
      console.error(error)
      return null
    })

    if (!allDisplays) return

    const displayContainingTargetWindow = getDisplayContainingWindow(allDisplays, win)

    if (displayContainingTargetWindow.id !== targetWindow.displayId) {
      targetWindow.displayId = displayContainingTargetWindow.id
      await ch.storageSessionSet({ tiled_windows: tiledWindows })
    }
  }
}

async function onCommandReceived (command) {
  if (command === 'tile-all') {
    await tileAllDisplays()
  }
}

async function tileWindows (allDisplays, targetDisplay) {
  const userPreferences = await preferences.get()

  const winResult = await ch.storageSessionGet({ tiled_windows: [] }).catch(error => {
    console.error(error)
    return { tiled_windows: [] }
  })

  const tiledWindows = winResult.tiled_windows

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
      await ch.windowsUpdate(masterWin.id, {
        height: masterWindowTile.height,
        width: masterWindowTile.width,
        top: masterWindowTile.top,
        left: masterWindowTile.left,
        state: 'normal'
      })
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
  const fetchedWindows = await ch.windowsGetAll().catch(error => {
    console.error('Failed to fetch windows:', error)
    return []
  })

  const allWindows = fetchedWindows.filter(win => win.state !== 'minimized' && win.type === 'normal')

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
        await ch.windowsUpdate(win.id, { ...expectedPosition, state: 'normal' })
      } catch (error) {
        console.error(error)
      }
    }
  }

  for (const tiledWindow of tileObj.tiledWindows) {
    tiledWindow.ignoreUpdate = false
  }

  try {
    await ch.storageSessionSet({ tiled_windows: tileObj.tiledWindows })
  } catch (error) {
    console.error(error)
  }
}

function compareWindowExpectedSize (pos1, pos2) {
  const keys1 = Object.keys(pos1)
  const keys2 = Object.keys(pos2)

  if (keys1.length !== keys2.length) {
    return false
  }

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

async function onMessageReceived (message, sender, sendResponse) {
  try {
    if (message.msg === 'preference_updated') {
      sendResponse()
  
      if (!await extensionIsEnabled()) return
  
      if (message.id === 'master_window' || message.id === 'padding') {
        await retileTiledDisplays()
      } else if ((message.id === 'auto_tiling' && message.value === true) || (message.id === 'master_ratio')) {
        await tileAllDisplays()
      } else if (message.id === 'auto_tiling' && message.value === false) {
        await ch.storageSessionRemove('tiled_windows')
      }
    } else if (message.msg === 'tile_now') {
      sendResponse()
      
      await tileAllDisplays()
    }
  } catch (error) {
    console.error(error)
  }
}

async function extensionIsEnabled () {
  try {
    const userPreferences = await preferences.get()
    return userPreferences.auto_tiling.value
  } catch (error) {
    console.error(error)
    return true
  }
}
