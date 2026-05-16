import { pool } from "@workspace/db";
import { getFaceServiceUrl } from "./config";
import { logger } from "./logger";

export type FaceMatchDecision = "match" | "review" | "new";

export interface AcceptedFaceFrame {
  photoIndex: number;
  embedding: number[];
  detScore: number;
}

export interface FaceMatchCandidate {
  childId: number;
  score: number;
  distance: number;
  matchedFrameCount: number;
}

export interface FaceMatchResult {
  decision: FaceMatchDecision;
  acceptedFrames: AcceptedFaceFrame[];
  candidate: FaceMatchCandidate | null;
  thresholds: FaceMatcherThresholds;
}

export interface FaceMatcherThresholds {
  match: number;
  review: number;
  detection: number;
  topK: number;
}

interface BatchEmbedResult {
  face_embeddings: number[][];
  face_detected: boolean[];
  det_scores: number[];
}

interface CandidateRow {
  child_id: number;
  face_dist: number;
}

interface CandidateAggregate {
  childId: number;
  bestScore: number;
  bestDistance: number;
  matchedFrameIndexes: Set<number>;
}

export class FaceMatchInputError extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(message: string, options: { status?: number; errorCode?: string } = {}) {
    super(message);
    this.name = "FaceMatchInputError";
    this.status = options.status ?? 400;
    this.errorCode = options.errorCode;
  }
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getFaceMatcherThresholds(): FaceMatcherThresholds {
  return {
    match: readNumberEnv("FACE_MATCH_THRESHOLD", 0.55),
    review: readNumberEnv("FACE_REVIEW_THRESHOLD", 0.38),
    detection: readNumberEnv("FACE_DET_THRESHOLD", 0.6),
    topK: Math.max(1, Math.floor(readNumberEnv("FACE_MATCH_TOP_K", 20))),
  };
}

function vecStr(v: number[]): string {
  return `[${v.join(",")}]`;
}

function l2normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, value) => sum + value * value, 0));
  return norm > 1e-8 ? v.map((value) => value / norm) : v;
}

async function fetchEmbeddings(faceImages: string[]): Promise<BatchEmbedResult> {
  const resp = await fetch(`${getFaceServiceUrl()}/embed/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ face_images: faceImages }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) throw new Error(`Face service HTTP ${resp.status}`);
  return resp.json() as Promise<BatchEmbedResult>;
}

async function findBestCandidate(
  frames: AcceptedFaceFrame[],
  topK: number,
): Promise<FaceMatchCandidate | null> {
  const aggregates = new Map<number, CandidateAggregate>();

  for (const frame of frames) {
    const result = await pool.query<CandidateRow>(
      `SELECT child_id, embedding <=> $1::vector AS face_dist
       FROM child_biometrics
       WHERE modality = 'face'
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vecStr(frame.embedding), topK],
    );

    for (const row of result.rows) {
      const distance = Number(row.face_dist);
      const score = Math.max(0, 1 - distance);
      const aggregate =
        aggregates.get(row.child_id) ??
        {
          childId: row.child_id,
          bestScore: 0,
          bestDistance: Number.POSITIVE_INFINITY,
          matchedFrameIndexes: new Set<number>(),
        };

      if (score > aggregate.bestScore) {
        aggregate.bestScore = score;
        aggregate.bestDistance = distance;
      }
      aggregate.matchedFrameIndexes.add(frame.photoIndex);
      aggregates.set(row.child_id, aggregate);
    }
  }

  const best = [...aggregates.values()].sort((a, b) => b.bestScore - a.bestScore)[0];
  if (!best) return null;

  return {
    childId: best.childId,
    score: best.bestScore,
    distance: best.bestDistance,
    matchedFrameCount: best.matchedFrameIndexes.size,
  };
}

export async function runFaceMatch(
  faceImages: string[],
  operation: "verify" | "register",
): Promise<FaceMatchResult> {
  if (!Array.isArray(faceImages) || faceImages.length === 0) {
    throw new FaceMatchInputError("face_images is required");
  }
  if (faceImages.length > 3) {
    throw new FaceMatchInputError("At most 3 face images are supported");
  }

  const thresholds = getFaceMatcherThresholds();
  let embeddings: BatchEmbedResult;
  try {
    embeddings = await fetchEmbeddings(faceImages);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new FaceMatchInputError(`Face service unavailable: ${message}`, { status: 503 });
  }

  const detectedFrames = embeddings.face_detected
    .map((detected, index) => ({
      detected,
      photoIndex: index,
      detScore: embeddings.det_scores[index] ?? 0,
      embedding: embeddings.face_embeddings[index] ?? [],
    }))
    .filter((frame) => frame.detected);

  if (detectedFrames.length === 0) {
    throw new FaceMatchInputError("No face detected. Please retake the photo in good light.", {
      errorCode: "no_face",
    });
  }

  const acceptedFrames = detectedFrames
    .filter((frame) => frame.detScore >= thresholds.detection)
    .map((frame) => ({
      photoIndex: frame.photoIndex,
      detScore: frame.detScore,
      embedding: l2normalize(frame.embedding),
    }));

  if (acceptedFrames.length === 0) {
    throw new FaceMatchInputError(
      "Photo quality too low — move closer, ensure good lighting, and hold still.",
      { errorCode: "quality_low" },
    );
  }

  const candidate = await findBestCandidate(acceptedFrames, thresholds.topK);
  let decision: FaceMatchDecision = "new";
  if (candidate && candidate.score >= thresholds.match) decision = "match";
  else if (candidate && candidate.score >= thresholds.review) decision = "review";

  logger.info(
    {
      operation,
      decision,
      acceptedFrames: acceptedFrames.length,
      candidateChildId: candidate?.childId ?? null,
      candidateScore: candidate?.score ?? null,
      thresholds,
    },
    "Face match decision",
  );

  return {
    decision,
    acceptedFrames,
    candidate,
    thresholds,
  };
}
