import { ConfigService } from '@nestjs/config';
import { IntentClassifierService } from '@/chatbotIntent/intentClassifierService';
import { CHATBOT_INTENT } from '@/types/chatbotIntent';

const mockCreate = jest.fn();

jest.mock('openai', (): unknown => {
  return {
    __esModule: true,
    default: class MockOpenAI {
      chat = { completions: { create: mockCreate } };
    },
  };
});

/** Build a service whose ConfigService returns the supplied values. */
function buildService(
  config: Record<string, string | undefined> = { OPENAI_API_KEY: 'test-key' },
): IntentClassifierService {
  const configService = {
    get: (key: string): string | undefined => config[key],
  } as ConfigService;

  return new IntentClassifierService(configService);
}

/** Shape of the request the service sends to the OpenAI SDK. */
interface IRecordedRequest {
  temperature: number;
  response_format: { type: string };
  messages: { role: string; content: string }[];
}

/** The request captured by the first mocked call. */
function firstRequest(): IRecordedRequest {
  const calls = mockCreate.mock.calls as unknown as IRecordedRequest[][];
  return calls[0][0];
}

/** Wrap a payload in the shape the OpenAI SDK returns. */
function mockCompletion(payload: unknown): void {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  });
}

describe('IntentClassifierService', (): void => {
  beforeEach((): void => {
    mockCreate.mockReset();
  });

  describe('client requirement examples', (): void => {
    it('routes an appointment request without a menu selection', async (): Promise<void> => {
      mockCompletion({
        intent: 'appointment_booking',
        confidence: 0.95,
        clarifyingQuestion: null,
        slots: {},
      });

      const result = await buildService().classify(
        "I'd like to book an appointment.",
      );

      expect(result.intent).toBe(CHATBOT_INTENT.APPOINTMENT_BOOKING);
      expect(result.isConfident).toBe(true);
      expect(result.usedFallback).toBe(false);
    });

    it('extracts department and date from a meeting request', async (): Promise<void> => {
      mockCompletion({
        intent: 'appointment_booking',
        confidence: 0.93,
        clarifyingQuestion: null,
        slots: {
          appointment: {
            departmentText: 'sales team',
            dateText: 'next week',
          },
        },
      });

      const result = await buildService().classify(
        'Can I schedule a meeting with the sales team next week?',
      );

      expect(result.intent).toBe(CHATBOT_INTENT.APPOINTMENT_BOOKING);
      expect(result.slots.appointment?.departmentText).toBe('sales team');
      expect(result.slots.appointment?.dateText).toBe('next week');
    });

    it('extracts duration and date from a call report request', async (): Promise<void> => {
      mockCompletion({
        intent: 'report_generation',
        confidence: 0.94,
        clarifyingQuestion: null,
        slots: {
          report: {
            reportDescription: 'all calls longer than 5 minutes',
            durationText: 'longer than 5 minutes',
            dateRangeText: 'yesterday',
          },
        },
      });

      const result = await buildService().classify(
        'I would like a report showing all calls longer than 5 minutes from yesterday.',
      );

      expect(result.intent).toBe(CHATBOT_INTENT.REPORT_GENERATION);
      expect(result.slots.report?.durationText).toBe('longer than 5 minutes');
      expect(result.slots.report?.dateRangeText).toBe('yesterday');
    });

    it('extracts location and date from a room report request', async (): Promise<void> => {
      mockCompletion({
        intent: 'report_generation',
        confidence: 0.92,
        clarifyingQuestion: null,
        slots: {
          report: {
            reportDescription: 'all calls',
            locationText: 'Room 5',
            dateRangeText: 'last week',
          },
        },
      });

      const result = await buildService().classify(
        'Can you generate a report for all calls from Room 5 last week?',
      );

      expect(result.slots.report?.locationText).toBe('Room 5');
      expect(result.slots.report?.dateRangeText).toBe('last week');
    });

    it('extracts location and range from an alarm report request', async (): Promise<void> => {
      mockCompletion({
        intent: 'report_generation',
        confidence: 0.91,
        clarifyingQuestion: null,
        slots: {
          report: {
            reportDescription: 'all alarms raised',
            locationText: 'Wing A',
            dateRangeText: 'last 30 days',
          },
        },
      });

      const result = await buildService().classify(
        'Show me all alarms raised in Wing A during the last 30 days.',
      );

      expect(result.slots.report?.locationText).toBe('Wing A');
      expect(result.slots.report?.dateRangeText).toBe('last 30 days');
    });
  });

  describe('ambiguity handling', (): void => {
    it('asks a clarifying question instead of acting on low confidence', async (): Promise<void> => {
      mockCompletion({
        intent: 'report_generation',
        confidence: 0.4,
        clarifyingQuestion:
          'Did you want a report about alarms, or help with an alarm right now?',
        slots: {},
      });

      const result = await buildService().classify('I need help with alarms');

      expect(result.isConfident).toBe(false);
      expect(result.clarifyingQuestion).toBe(
        'Did you want a report about alarms, or help with an alarm right now?',
      );
    });

    it('always supplies a clarifying question when not confident', async (): Promise<void> => {
      mockCompletion({
        intent: 'general_query',
        confidence: 0.2,
        clarifyingQuestion: null,
        slots: {},
      });

      const result = await buildService().classify('hmm');

      expect(result.isConfident).toBe(false);
      expect(result.clarifyingQuestion).toBeTruthy();
    });

    it('never marks an unknown intent as confident', async (): Promise<void> => {
      mockCompletion({
        intent: 'unknown',
        confidence: 0.99,
        clarifyingQuestion: null,
        slots: {},
      });

      const result = await buildService().classify('hello there');

      expect(result.intent).toBe(CHATBOT_INTENT.UNKNOWN);
      expect(result.isConfident).toBe(false);
    });

    it('returns unknown for an empty message without calling the model', async (): Promise<void> => {
      const result = await buildService().classify('   ');

      expect(result.intent).toBe(CHATBOT_INTENT.UNKNOWN);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('malformed model output', (): void => {
    it('falls back when the model returns an unrecognised intent', async (): Promise<void> => {
      mockCompletion({
        intent: 'drop_all_tables',
        confidence: 0.99,
        slots: {},
      });

      const result = await buildService().classify('generate a report');

      // Rejected, then recovered by keyword matching.
      expect(result.intent).toBe(CHATBOT_INTENT.REPORT_GENERATION);
      expect(result.usedFallback).toBe(true);
    });

    it('falls back when the model returns non-JSON', async (): Promise<void> => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'not json at all' } }],
      });

      const result = await buildService().classify('I want to book a meeting');

      expect(result.intent).toBe(CHATBOT_INTENT.APPOINTMENT_BOOKING);
      expect(result.usedFallback).toBe(true);
    });

    it('drops slot keys that are not on the allow list', async (): Promise<void> => {
      mockCompletion({
        intent: 'report_generation',
        confidence: 0.9,
        clarifyingQuestion: null,
        slots: {
          report: {
            dateRangeText: 'yesterday',
            siteId: 'injected-site-id',
            sqlWhere: '1=1; DROP TABLE users;--',
          },
        },
      });

      const result = await buildService().classify('report for yesterday');

      expect(result.slots.report?.dateRangeText).toBe('yesterday');
      expect(result.slots.report).not.toHaveProperty('siteId');
      expect(result.slots.report).not.toHaveProperty('sqlWhere');
    });

    it('ignores appointment slots on a report intent', async (): Promise<void> => {
      mockCompletion({
        intent: 'report_generation',
        confidence: 0.9,
        clarifyingQuestion: null,
        slots: {
          report: { dateRangeText: 'today' },
          appointment: { dateText: 'tomorrow' },
        },
      });

      const result = await buildService().classify('report for today');

      expect(result.slots.report?.dateRangeText).toBe('today');
      expect(result.slots.appointment).toBeUndefined();
    });

    it('clamps an out-of-range confidence value', async (): Promise<void> => {
      mockCompletion({
        intent: 'general_query',
        confidence: 42,
        clarifyingQuestion: null,
        slots: {},
      });

      const result = await buildService().classify('what is Smart-Caller?');

      expect(result.confidence).toBe(1);
    });

    it('treats a non-numeric confidence as zero', async (): Promise<void> => {
      mockCompletion({
        intent: 'general_query',
        confidence: 'very sure',
        clarifyingQuestion: null,
        slots: {},
      });

      const result = await buildService().classify('what is Smart-Caller?');

      expect(result.confidence).toBe(0);
      expect(result.isConfident).toBe(false);
    });
  });

  describe('resilience', (): void => {
    it('falls back to keyword matching when the API call fails', async (): Promise<void> => {
      mockCreate.mockRejectedValueOnce(new Error('upstream timeout'));

      const result = await buildService().classify(
        'I want to return a product',
      );

      expect(result.intent).toBe(CHATBOT_INTENT.RETURN_REQUEST);
      expect(result.usedFallback).toBe(true);
    });

    it('uses keyword matching when no API key is configured', async (): Promise<void> => {
      const service = buildService({ OPENAI_API_KEY: undefined });

      const result = await service.classify('talk to a human please');

      expect(result.intent).toBe(CHATBOT_INTENT.HUMAN_CALLBACK);
      expect(result.usedFallback).toBe(true);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('returns unknown from the fallback when nothing matches', async (): Promise<void> => {
      const service = buildService({ OPENAI_API_KEY: undefined });

      const result = await service.classify('asdfgh');

      expect(result.intent).toBe(CHATBOT_INTENT.UNKNOWN);
      expect(result.clarifyingQuestion).toBeTruthy();
    });
  });

  describe('prompt handling', (): void => {
    it('marks prior user turns as context rather than instructions', async (): Promise<void> => {
      mockCompletion({
        intent: 'report_generation',
        confidence: 0.9,
        clarifyingQuestion: null,
        slots: {},
      });

      await buildService().classify('make it PDF instead', [
        { role: 'user', content: 'send me yesterdays calls' },
        { role: 'assistant', content: 'Which format would you like?' },
      ]);

      const priorUserTurn = firstRequest().messages.find((message): boolean =>
        message.content.includes('send me yesterdays calls'),
      );

      expect(priorUserTurn?.content).toContain('[previous message]');
    });

    it('requests deterministic JSON output', async (): Promise<void> => {
      mockCompletion({
        intent: 'general_query',
        confidence: 0.9,
        clarifyingQuestion: null,
        slots: {},
      });

      await buildService().classify('what are your hours?');

      const request = firstRequest();

      expect(request.temperature).toBe(0);
      expect(request.response_format.type).toBe('json_object');
    });
  });

  describe('QA: a misspelt request still routes correctly', (): void => {
    // "please generate the report of todya" was classified as general_query
    // and handed to the assistant, which cannot generate reports — while the
    // correctly spelt version worked. The keyword matcher ignores the misspelt
    // word and sees "report", so it recovers the routing.
    it.each([
      ['please generate the report of todya', 'report_generation'],
      ['please generate the report of today', 'report_generation'],
      ['i want to return the product', 'return_request'],
    ])('recovers "%s" as %s', async (message, expected): Promise<void> => {
      mockCompletion({
        intent: 'general_query',
        confidence: 0.9,
        clarifyingQuestion: null,
        slots: {},
      });

      const result = await buildService().classify(message);

      expect(result.intent).toBe(expected);
    });

    it('leaves a genuine general query alone', async (): Promise<void> => {
      mockCompletion({
        intent: 'general_query',
        confidence: 0.9,
        clarifyingQuestion: null,
        slots: {},
      });

      const result = await buildService().classify('what is smart-caller');

      expect(result.intent).toBe('general_query');
    });
  });

  describe('QA: a report request with no detail still routes correctly', (): void => {
    // "I want to generate a report" came back as `unknown` while "generate a
    // report for today" worked: every report example in the prompt carried a
    // date or a location, so the model learned that detail was what made it a
    // report. The user was handed to the assistant, which answered with manual
    // instructions for building the report by hand instead of starting the
    // report flow.
    it('instructs the model that a bare request keeps its intent', (): void => {
      const prompt = buildService()['buildSystemPrompt']();

      expect(prompt).toContain('A BARE REQUEST IS STILL A REQUEST');
      expect(prompt).toContain('I want to generate a report');
    });

    it.each([
      'I want to generate a report',
      'generate a report for me',
      'can you make me a report',
    ])(
      'recovers "%s" as report_generation even if the model says unknown',
      async (message): Promise<void> => {
        mockCompletion({
          intent: 'unknown',
          confidence: 0.5,
          clarifyingQuestion: 'What specific data do you want the report on?',
          slots: {},
        });

        const result = await buildService().classify(message);

        expect(result.intent).toBe('report_generation');
      },
    );
  });
});
