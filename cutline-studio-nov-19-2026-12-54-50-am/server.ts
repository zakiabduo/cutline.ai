import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  clampClipRange,
  extractYouTubeVideoId,
  splitCaptionIntoWords,
} from './src/utils/shortsEngine';
import type { ExtractedClip, SceneCutType, TranscriptCue } from './src/types/studio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '25mb' }));

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing in environment variables.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\n/g, ' ')
    .trim();
}

function parseTimedXmlTranscript(xml: string): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  const regex = /<text start="([^"]+)"(?:\s+dur="([^"]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const duration = match[2] ? parseFloat(match[2]) : 2.5;
    const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, ''));
    if (Number.isFinite(start) && text) {
      cues.push({
        start: Number(start.toFixed(2)),
        duration: Number(Math.max(0.5, duration).toFixed(2)),
        text,
      });
    }
  }
  return cues;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'cutline-studio' });
});

app.post('/api/youtube/inspect', async (req, res) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Please provide a valid YouTube URL.' });
    }

    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      return res.status(400).json({
        error: 'Invalid YouTube URL. Supported formats: youtube.com/watch?v=..., youtu.be/..., or youtube.com/shorts/...',
      });
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

    let title = `YouTube Video (${videoId})`;
    let author = 'YouTube Creator';
    let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    let duration = 600;
    let description = '';
    let transcriptCues: TranscriptCue[] = [];

    // 1. Fetch oEmbed metadata
    try {
      const oembedResp = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
        { signal: AbortSignal.timeout(7000) }
      );
      if (oembedResp.ok) {
        const oembed = (await oembedResp.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        if (oembed.title) title = oembed.title;
        if (oembed.author_name) author = oembed.author_name;
        if (oembed.thumbnail_url) thumbnailUrl = oembed.thumbnail_url;
      }
    } catch {
      // Continue to watch page inspection
    }

    // 2. Fetch watch page for duration, description, and captionTracks
    try {
      const pageResp = await fetch(canonicalUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(9000),
      });

      if (pageResp.ok) {
        const html = await pageResp.text();
        const playerMatch = html.match(
          /ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});\s*(?:var\s|const\s|let\s|<\/script>)/
        );
        if (playerMatch) {
          const playerData = JSON.parse(playerMatch[1]) as {
            videoDetails?: {
              title?: string;
              author?: string;
              lengthSeconds?: string;
              shortDescription?: string;
            };
            captions?: {
              playerCaptionsTracklistRenderer?: {
                captionTracks?: Array<{
                  baseUrl?: string;
                  languageCode?: string;
                  kind?: string;
                }>;
              };
            };
          };

          if (playerData.videoDetails?.title) title = playerData.videoDetails.title;
          if (playerData.videoDetails?.author) author = playerData.videoDetails.author;
          if (playerData.videoDetails?.lengthSeconds) {
            const parsedLen = parseInt(playerData.videoDetails.lengthSeconds, 10);
            if (Number.isFinite(parsedLen) && parsedLen > 0) duration = parsedLen;
          }
          if (playerData.videoDetails?.shortDescription) {
            description = playerData.videoDetails.shortDescription.slice(0, 1200);
          }

          const tracks =
            playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
          const preferredTrack =
            tracks.find((t) => t.languageCode?.startsWith('en') && t.kind !== 'asr') ??
            tracks.find((t) => t.languageCode?.startsWith('en')) ??
            tracks[0];

          if (preferredTrack?.baseUrl) {
            const capResp = await fetch(preferredTrack.baseUrl, {
              signal: AbortSignal.timeout(7000),
            });
            if (capResp.ok) {
              const xml = await capResp.text();
              transcriptCues = parseTimedXmlTranscript(xml);
            }
          }
        }
      }
    } catch {
      // Watch page scraping may be rate-limited; client can supply transcript or AI URL grounding
    }

    return res.json({
      videoId,
      canonicalUrl,
      title,
      author,
      thumbnailUrl,
      duration,
      description,
      transcriptCues,
      hasCaptions: transcriptCues.length > 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to inspect YouTube URL.';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const {
      sourceType,
      title,
      author,
      duration,
      youtubeUrl,
      transcriptText,
      transcriptCues,
      frames,
      clipTargetCount = 3,
    } = req.body as {
      sourceType: 'youtube' | 'upload';
      title: string;
      author?: string;
      duration: number;
      youtubeUrl?: string;
      transcriptText?: string;
      transcriptCues?: TranscriptCue[];
      frames?: Array<{ timestamp: number; mimeType: string; dataBase64: string }>;
      clipTargetCount?: number;
    };

    if (!title || !Number.isFinite(duration) || duration <= 0) {
      return res.status(400).json({ error: 'Video title and valid duration are required.' });
    }

    const ai = getGeminiClient();

    const formattedTranscript =
      transcriptCues && transcriptCues.length > 0
        ? transcriptCues
            .slice(0, 350)
            .map((c) => `[${c.start.toFixed(1)}s] ${c.text}`)
            .join('\n')
        : transcriptText?.trim() || '';

    const hasFrames = Array.isArray(frames) && frames.length > 0;

    if (!formattedTranscript && !hasFrames && !youtubeUrl) {
      return res.status(400).json({
        error: 'Provide video frames, a timed transcript, or a valid YouTube URL to analyze.',
      });
    }

    const systemInstruction = `You are a senior short-form video editor and scene-detection AI for YouTube Shorts.
Your job is to analyze a long-form video (via its visual keyframes, timed transcript, and metadata) and extract the ${Math.min(
      5,
      Math.max(2, clipTargetCount)
    )} MOST ENGAGING standalone vertical Shorts clips (each 18 to 52 seconds long).

For every extracted clip:
1. Choose exact startTime and endTime (within 0 and ${duration.toFixed(1)} seconds) that open with a strong hook and close on a clear payoff.
2. Perform scene detection inside the clip: split the clip into 2-5 contiguous SceneBoundary segments covering [startTime, endTime], noting cutType ('hook' | 'speaker-shift' | 'b-roll' | 'topic-pivot' | 'climax'), visual label, energy ('low' | 'medium' | 'high'), and cropFocusX (0 = far left subject, 50 = center, 100 = far right subject) for 9:16 vertical smart framing.
3. Generate punchy, synchronized CaptionSegment lines covering the clip's spoken dialogue so subtitles read naturally in 9:16 Shorts format.
4. Provide an authentic engagement rationale explaining why the hook and pacing hold viewer retention.`;

    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (hasFrames) {
      for (const frame of frames!.slice(0, 12)) {
        parts.push({
          text: `Keyframe at timestamp ${frame.timestamp.toFixed(2)}s:`,
        });
        parts.push({
          inlineData: {
            mimeType: frame.mimeType || 'image/jpeg',
            data: frame.dataBase64,
          },
        });
      }
    }

    const promptText = [
      `Video Title: ${title}`,
      author ? `Creator: ${author}` : '',
      `Source Type: ${sourceType}`,
      `Total Duration: ${duration.toFixed(1)} seconds`,
      youtubeUrl ? `YouTube URL: ${youtubeUrl}` : '',
      formattedTranscript
        ? `\nTranscript / Context:\n${formattedTranscript}`
        : '\nNo spoken transcript was available; infer spoken dialogue and scene beats directly from the visual keyframes and video context.',
    ]
      .filter(Boolean)
      .join('\n');

    parts.push({ text: promptText });

    const useUrlContext = sourceType === 'youtube' && Boolean(youtubeUrl) && !formattedTranscript && !hasFrames;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction,
        ...(useUrlContext ? { tools: [{ urlContext: {} }, { googleSearch: {} }] } : {}),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcriptSummary: {
              type: Type.STRING,
              description: '2-sentence editorial summary of the long-form video.',
            },
            clips: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  hookLine: { type: Type.STRING },
                  rationale: { type: Type.STRING },
                  startTime: { type: Type.NUMBER },
                  endTime: { type: Type.NUMBER },
                  pacing: { type: Type.STRING },
                  platformTitle: { type: Type.STRING },
                  suggestedHashtags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  scenes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        start: { type: Type.NUMBER },
                        end: { type: Type.NUMBER },
                        label: { type: Type.STRING },
                        cutType: { type: Type.STRING },
                        cropFocusX: { type: Type.NUMBER },
                        energy: { type: Type.STRING },
                      },
                      required: ['start', 'end', 'label', 'cutType', 'cropFocusX', 'energy'],
                    },
                  },
                  captions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        start: { type: Type.NUMBER },
                        end: { type: Type.NUMBER },
                        text: { type: Type.STRING },
                        speaker: { type: Type.STRING },
                      },
                      required: ['start', 'end', 'text'],
                    },
                  },
                },
                required: [
                  'title',
                  'hookLine',
                  'rationale',
                  'startTime',
                  'endTime',
                  'pacing',
                  'platformTitle',
                  'suggestedHashtags',
                  'scenes',
                  'captions',
                ],
              },
            },
          },
          required: ['transcriptSummary', 'clips'],
        },
      },
    });

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      return res.status(502).json({ error: 'Gemini returned an empty analysis response.' });
    }

    const parsed = JSON.parse(rawText) as {
      transcriptSummary: string;
      clips: Array<{
        title: string;
        hookLine: string;
        rationale: string;
        startTime: number;
        endTime: number;
        pacing: string;
        platformTitle: string;
        suggestedHashtags: string[];
        scenes: Array<{
          start: number;
          end: number;
          label: string;
          cutType: string;
          cropFocusX: number;
          energy: string;
        }>;
        captions: Array<{
          start: number;
          end: number;
          text: string;
          speaker?: string;
        }>;
      }>;
    };

    const normalizedClips: ExtractedClip[] = (parsed.clips ?? []).map((c, idx) => {
      const clamped = clampClipRange(c.startTime, c.endTime, duration, 8);
      const clipDur = Number((clamped.end - clamped.start).toFixed(1));
      const validPacing =
        c.pacing === 'Rapid' || c.pacing === 'Dynamic' || c.pacing === 'Steady'
          ? c.pacing
          : 'Dynamic';

      const scenes = (c.scenes ?? []).map((s, sIdx) => {
        const sStart = Math.max(clamped.start, Math.min(clamped.end - 1, s.start));
        const sEnd = Math.max(sStart + 1, Math.min(clamped.end, s.end));
        const cutType: SceneCutType =
          s.cutType === 'hook' ||
          s.cutType === 'speaker-shift' ||
          s.cutType === 'b-roll' ||
          s.cutType === 'topic-pivot' ||
          s.cutType === 'climax'
            ? s.cutType
            : 'topic-pivot';
        const energy: 'low' | 'medium' | 'high' =
          s.energy === 'low' || s.energy === 'medium' || s.energy === 'high'
            ? s.energy
            : 'medium';
        return {
          id: `sc-${idx}-${sIdx}`,
          start: Number(sStart.toFixed(2)),
          end: Number(sEnd.toFixed(2)),
          label: s.label || `Scene ${sIdx + 1}`,
          cutType,
          cropFocusX: Math.max(0, Math.min(100, Math.round(s.cropFocusX ?? 50))),
          energy,
        };
      });

      const captions = (c.captions ?? []).map((cap, cIdx) => {
        const capStart = Math.max(clamped.start, Math.min(clamped.end - 0.5, cap.start));
        const capEnd = Math.max(capStart + 0.5, Math.min(clamped.end, cap.end));
        const text = (cap.text || '').trim() || '...';
        return {
          id: `cap-${idx}-${cIdx}`,
          start: Number(capStart.toFixed(2)),
          end: Number(capEnd.toFixed(2)),
          text,
          speaker: cap.speaker,
          words: splitCaptionIntoWords(text, capStart, capEnd),
        };
      });

      return {
        id: `clip-${Date.now()}-${idx}`,
        rank: idx + 1,
        title: c.title || `Clip ${idx + 1}`,
        hookLine: c.hookLine || '',
        rationale: c.rationale || '',
        startTime: clamped.start,
        endTime: clamped.end,
        duration: clipDur,
        pacing: validPacing,
        platformTitle: c.platformTitle || c.title,
        suggestedHashtags: Array.isArray(c.suggestedHashtags)
          ? c.suggestedHashtags.slice(0, 6)
          : ['#shorts'],
        scenes,
        captions,
      };
    });

    return res.json({
      transcriptSummary: parsed.transcriptSummary || '',
      clips: normalizedClips,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'AI scene and clip analysis failed.';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/captions/rewrite', async (req, res) => {
  try {
    const { captions, mode } = req.body as {
      captions: Array<{ id: string; start: number; end: number; text: string; speaker?: string }>;
      mode: 'punchy' | 'concise' | 'spanish' | 'french';
    };

    if (!Array.isArray(captions) || captions.length === 0) {
      return res.status(400).json({ error: 'Captions array is required.' });
    }

    const modeInstructions: Record<string, string> = {
      punchy:
        'Rewrite each subtitle line to be sharper, high-retention, and punchier for YouTube Shorts while preserving meaning and keeping word count tight.',
      concise:
        'Condense each subtitle line by 25-35% into crisp on-screen phrases without losing key facts.',
      spanish:
        'Translate each subtitle line naturally into idiomatic Latin American Spanish suitable for short-form captions.',
      french:
        'Translate each subtitle line naturally into crisp modern French suitable for short-form captions.',
    };

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `${modeInstructions[mode] ?? modeInstructions.punchy}\n\nCaptions:\n${JSON.stringify(
        captions.map((c) => ({ id: c.id, text: c.text }))
      )}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              text: { type: Type.STRING },
            },
            required: ['id', 'text'],
          },
        },
      },
    });

    const rewritten = JSON.parse(response.text ?? '[]') as Array<{
      id: string;
      text: string;
    }>;
    const textById = new Map(rewritten.map((r) => [r.id, r.text]));

    const updated = captions.map((cap) => {
      const nextText = (textById.get(cap.id) ?? cap.text).trim();
      return {
        ...cap,
        text: nextText,
        words: splitCaptionIntoWords(nextText, cap.start, cap.end),
      };
    });

    return res.json({ captions: updated });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to rewrite captions.';
    return res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cutline Studio server listening on http://localhost:${PORT}`);
  });
}

startServer();
