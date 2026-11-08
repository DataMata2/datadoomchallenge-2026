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
      "Используйте успешный ответ организаторов в JSON, массив диалогов или один объект диалога.",
    );
  const data = envelope.data;
  if (
    typeof data.dataset_group_id !== "string" ||
    !data.dataset_group_id.trim()
  )
    throw new Error(
      "Введите идентификатор набора данных перед предпросмотром диалогов.",
    );
  if (!Array.isArray(data.records) || !data.records.length)
    throw new Error("В файле нет диалогов.");
  if (data.total_records !== data.records.length)
    throw new Error(
      "Заявленное число записей не совпадает с числом диалогов в файле.",
    );
  const ids = new Set<string>();
  for (const [index, row] of data.records.entries()) {
    const location = `Диалог ${index + 1}`;
    if (
      !object(row) ||
      typeof row.conversation_id !== "string" ||
      !row.conversation_id.trim()
    )
      throw new Error(`${location} должен содержать непустой conversation_id.`);
    if (ids.has(row.conversation_id))
      throw new Error(
        "Найдены повторяющиеся идентификаторы диалогов. Каждый идентификатор должен быть уникальным в наборе.",
      );
    ids.add(row.conversation_id);
    if (
      !["RU", "KZ", "EN"].includes(String(row.language)) ||
      !["agent chat", "voice call"].includes(String(row.channel))
    )
      throw new Error(
        `${location} должен содержать допустимый channel (agent chat / voice call) и language (RU / KZ / EN).`,
      );
    if (row.audio_url !== null && typeof row.audio_url !== "string")
      throw new Error(
        `${location} должен содержать audio_url: null для чата или ссылку на запись.`,
      );
    if (!Array.isArray(row.transcript) || !row.transcript.length)
      throw new Error(
        `${location} должен содержать хотя бы одну реплику в transcript.`,
      );
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
          `${location}: каждая реплика должна содержать timestamp, speaker и text. Допустимые участники: client, operator, bot, system.`,
        );
    }
  }
  return envelope as SourceEnvelope;
}
