import { dual, Callback } from "./dual";

interface Alarm {
  name: string;
  scheduledTime: number;
  periodInMinutes?: number;
}
type AlarmListener = (alarm: Alarm) => void;

// Alarms are timestamps. A timer fires them, and they are re-checked when the
// app returns to the foreground, because Android may freeze timers in the
// background.
export function createAlarms() {
  const alarms = new Map<string, Alarm>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let listeners: AlarmListener[] = [];

  function arm(alarm: Alarm): void {
    clearTimeout(timers.get(alarm.name));
    // setTimeout caps at ~24.8 days; re-arm in slices
    const wait = Math.min(
      Math.max(alarm.scheduledTime - Date.now(), 0),
      2 ** 30
    );
    timers.set(
      alarm.name,
      setTimeout(() => check(alarm.name), wait)
    );
  }

  function check(name: string): void {
    const alarm = alarms.get(name);
    if (!alarm) return;
    if (alarm.scheduledTime > Date.now()) {
      arm(alarm);
      return;
    }
    if (alarm.periodInMinutes) {
      alarm.scheduledTime = Date.now() + alarm.periodInMinutes * 60000;
      arm(alarm);
    } else {
      alarms.delete(name);
      clearTimeout(timers.get(name));
      timers.delete(name);
    }
    for (const listener of [...listeners]) {
      listener({ ...alarm });
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        for (const name of [...alarms.keys()]) check(name);
      }
    });
  }

  return {
    create(
      name: string | { delayInMinutes?: number; periodInMinutes?: number },
      info?: {
        delayInMinutes?: number;
        periodInMinutes?: number;
        when?: number;
      }
    ): void {
      if (typeof name !== "string") {
        info = name;
        name = "";
      }
      const delay = info?.delayInMinutes ?? info?.periodInMinutes ?? 0;
      const alarm: Alarm = {
        name,
        scheduledTime: info?.when ?? Date.now() + delay * 60000,
        periodInMinutes: info?.periodInMinutes,
      };
      alarms.set(name, alarm);
      arm(alarm);
    },
    clear(
      name?: string | Callback<boolean>,
      callback?: Callback<boolean>
    ): Promise<boolean> | undefined {
      if (typeof name === "function") {
        callback = name;
        name = undefined;
      }
      return dual(callback, async () => {
        const key = name ?? "";
        clearTimeout(timers.get(key));
        timers.delete(key);
        return alarms.delete(key);
      });
    },
    onAlarm: {
      addListener: (listener: AlarmListener) => {
        listeners.push(listener);
      },
      removeListener: (listener: AlarmListener) => {
        listeners = listeners.filter((l) => l !== listener);
      },
      hasListener: (listener: AlarmListener) => listeners.includes(listener),
    },
  };
}
