import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMappingDto, UpdateMappingDto } from './mappings.dto';

describe('Валюта маппинга', () => {
  const create = { connectionId: 'connection', destinationId: 'destination', entityType: 'deal', statusId: 'WON', eventName: 'Purchase' };

  it('нормализует код при создании и редактировании', async () => {
    const added = plainToInstance(CreateMappingDto, { ...create, currency: ' kzt ' });
    const updated = plainToInstance(UpdateMappingDto, { currency: 'usd' });
    expect(added.currency).toBe('KZT');
    expect(updated.currency).toBe('USD');
    expect(await validate(added)).toEqual([]);
    expect(await validate(updated)).toEqual([]);
  });

  it.each(['тг', 'ZZZ', ''])('отклоняет неверную валюту %j в обоих эндпоинтах', async (currency) => {
    for (const dto of [plainToInstance(CreateMappingDto, { ...create, currency }), plainToInstance(UpdateMappingDto, { currency })]) {
      expect(await validate(dto)).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'currency' })]));
    }
  });

  it('сохраняет совместимость с запросами без валюты', async () => {
    expect(await validate(plainToInstance(CreateMappingDto, create))).toEqual([]);
    expect(await validate(plainToInstance(UpdateMappingDto, { isActive: true }))).toEqual([]);
  });
});
