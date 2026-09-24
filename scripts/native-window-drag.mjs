import {execFile as execFileCallback} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {promisify} from 'node:util';

const execFile=promisify(execFileCallback);
const swiftSource=String.raw`import Cocoa
import Foundation

let arguments=CommandLine.arguments
guard arguments.count == 6,
      let processID=Int32(arguments[1]),
      let relativeX=Double(arguments[2]),
      let relativeY=Double(arguments[3]),
      let relativeDeltaX=Double(arguments[4]),
      let relativeDeltaY=Double(arguments[5]),
      CGPreflightPostEventAccess() else {
  fputs("Native mouse event access is unavailable.\n",stderr)
  exit(2)
}

NSRunningApplication(processIdentifier:processID)?.activate(options:[.activateAllWindows])
usleep(250000)
let entries=(CGWindowListCopyWindowInfo([.optionOnScreenOnly],kCGNullWindowID) as? [[String:Any]] ?? [])
var target:CGRect?
for entry in entries {
  guard (entry[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == processID,
        (entry[kCGWindowLayer as String] as? NSNumber)?.intValue == 0,
        entry[kCGWindowBounds as String] != nil else { continue }
  let dictionary=entry[kCGWindowBounds as String]! as! CFDictionary
  guard let rect=CGRect(dictionaryRepresentation:dictionary) else { continue }
  if target == nil || rect.width * rect.height > target!.width * target!.height { target=rect }
}
guard let window=target else {
  fputs("The isolated Electron window was not found.\n",stderr)
  exit(3)
}
let start=CGPoint(x:window.minX + CGFloat(relativeX) * window.width,y:window.minY + CGFloat(relativeY) * window.height)
let end=CGPoint(x:start.x + CGFloat(relativeDeltaX) * window.width,y:start.y + CGFloat(relativeDeltaY) * window.height)
func post(_ type:CGEventType,_ point:CGPoint) {
  CGEvent(mouseEventSource:nil,mouseType:type,mouseCursorPosition:point,mouseButton:.left)?.post(tap:.cghidEventTap)
}
post(.mouseMoved,start)
usleep(150000)
post(.leftMouseDown,start)
usleep(120000)
for step in 1...6 {
  let progress=CGFloat(step) / 6
  post(.leftMouseDragged,CGPoint(x:start.x + (end.x-start.x)*progress,y:start.y + (end.y-start.y)*progress))
  usleep(90000)
}
post(.leftMouseUp,end)
usleep(250000)
`;

export const nativeWindowDragSupported=process.platform==='darwin';

export async function buildNativeWindowDragHelper(directory){
  if(!nativeWindowDragSupported)throw new Error('Native macOS drag verification requires darwin.');
  const source=join(directory,'native-window-drag.swift'),binary=join(directory,'native-window-drag');
  await writeFile(source,swiftSource);
  await execFile('/usr/bin/xcrun',['swiftc',source,'-o',binary],{timeout:90000,maxBuffer:1024*1024});
  return {
    drag:async({pid,viewport,start,delta})=>{
      if(!(viewport.width>0&&viewport.height>0))throw new Error('Cannot map a native drag without a visible viewport.');
      await execFile(binary,[String(pid),String(start.x/viewport.width),String(start.y/viewport.height),String(delta.x/viewport.width),String(delta.y/viewport.height)],{timeout:15000,maxBuffer:1024*1024});
    }
  };
}
