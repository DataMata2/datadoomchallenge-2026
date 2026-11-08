import type { SourceEnvelope } from "./api";
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
/** Preview validation; the existing API remains the strict, atomic validator. */
export function prepareImport(value: unknown, group: string): SourceEnvelope {
  let envelope: unknown = value;
  if (Array.isArray(value) || (object(value) && "conversation_id" in value)) {
    const records = Array.isArray(value) ? value : [value];
    envelope = {
      error: "",
      isSuccess: true,
      data: {
        dataset_group_id: group.trim(),
        total_records: records.length,
        records,
      },
    };
  }
  if (
    !object(envelope) ||
    envelope.isSuccess !== true ||
    envelope.error !== "" ||
    !object(envelope.data)
  )
    throw new Error(
      "Use a successful organizer JSON response, an array of conversations, or one conversation object.",
    );
  const data = envelope.data;
  if (
    typeof data.dataset_group_id !== "string" ||
    !data.dataset_group_id.trim()
  )
    throw new Error(
      "Enter a dataset ID before previewing these conversations.",
    );
  if (!Array.isArray(data.records) || !data.records.length)
    throw new Error("The file contains no conversations.");
  if (data.total_records !== data.records.length)
    throw new Error(
      "The declared record count does not match the conversations in the file.",
    );
  const ids = new Set<string>();
  for (const [index, row] of data.records.entries()) {
    const location = `Conversation ${index + 1}`;
    if (
      !object(row) ||
      typeof row.conversation_id !== "string" ||
      !row.conversation_id.trim()
    )
      throw new Error(`${location} needs a nonempty conversation_id.`);
    if (ids.has(row.conversation_id))
      throw new Error(
        "Duplicate conversation IDs were found. Each ID must be unique within the dataset.",
      );
    ids.add(row.conversation_id);
    if (
      !["RU", "KZ", "EN"].includes(String(row.language)) ||
      !["agent chat", "voice call"].includes(String(row.channel))
    )
      throw new Error(
        `${location} needs a supported channel (agent chat / voice call) and language (RU / KZ / EN).`,
      );
    if (row.audio_url !== null && typeof row.audio_url !== "string")
      throw new Error(
        `${location} needs audio_url: null for a chat, or a recording URL.`,
      );
    if (!Array.isArray(row.transcript) || !row.transcript.length)
      throw new Error(`${location} needs at least one transcript turn.`);
    for (const turn of row.transcript) {
      if (
        !object(turn) ||
        !["client", "operator", "bot", "system"].includes(
          String(turn.speaker),
        ) ||
        typeof turn.text !== "string" ||
        typeof turn.timestamp !== "string" ||
        !turn.timestamp.trim()
      )
        throw new Error(
          `${location}: each turn needs timestamp, speaker and text. Speakers: client, operator, bot, system.`,
        );
    }
  }
  return envelope as SourceEnvelope;
}
