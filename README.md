# Find

Prototype 3 of the **Echo** body-interface project (IPD 5900, Penn). An iPhone web app that helps a blind person find one named thing, such as a door, the exit, a chair or Room 706, by turning their body.

- **Echo** (prototype 1) keeps you from walking into things.
- **Point & Explain** (prototype 2) tells you what something is.
- **Find** (prototype 3) gets you to it.

## How it works

1. **Hold the screen** and say what you want: "Find the door", "Where's a chair?", "Exit".
2. **Turn slowly.** Beeps get faster and higher as you face it, and come from its side (stereo; AirPods work best).
3. When you're facing it, a chime plays and a voice says, for example, "Glass door, ahead, about 4 steps. Door is closed."
4. As you walk, it announces the steps left. A rising chime plays when you arrive.

**Tap** to hear where it is now. Say **"stop"** to end. On a computer: hold Space to talk, Enter = where is it, Esc = stop.

## Inputs

- **Voice:** you name the target (Web Speech API).
- **Body rotation:** the phone's gyroscope measures how far you've turned, so the beeps react immediately instead of waiting for the next AI answer.
- **Camera:** finds the target in two ways:
  - Common objects (chair, person, table, couch, bottle, cup, TV, laptop, toilet, sink…) use MediaPipe EfficientDet on the phone at about 7 fps, with no network needed.
  - Anything else (door, exit, stairs, elevator, Room 706…) goes to `/api/locate`, which sends a 640 px frame to DeepSeek vision. The reply gives the target's position in the frame, a rough distance in steps, a label, and a short note.

The gyro's sign differs between phones. It is learned automatically from consecutive sightings (`learnSign`).

## Deploy

Vercel, no build step. Environment variable: `DEEPSEEK_API_KEY` (optional: `DEEPSEEK_MODEL`, default `deepseek-flash`).
To check the API, `GET /api/locate` should return `{"ok":true,"hasKey":true}`.

iPhone: Safari needs camera, microphone and **Motion & Orientation** permission (asked on the start tap). For voice input, turn on Dictation in iPhone settings.

## Tuning (top of `index.html`)

`LOCK_DEG 7` · `LOCK_MS 700` · `AI_GAP_MS 500` · `LOCAL_EVERY 150` · `FIX_TTL_AI 6000` · `LOST_MS 5000` · `GIVE_UP_DEG 340` · `GIVE_UP_MS 35000` · `ARRIVE_STEPS 1`

*Prototype only. Not a mobility aid.*
