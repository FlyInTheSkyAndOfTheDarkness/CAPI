import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { DeliveryLog } from '../lib/types';
import { Badge, Card, PageHeader, Select } from '../components/ui';

export default function Logs() {
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    const query = status ? `?status=${status}` : '';
    setLogs(await api<DeliveryLog[]>(`/logs${query}`));
  }, [status]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 10_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Логи доставки"
        action={
          <div className="w-48">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Все статусы</option>
              <option value="SENT">Отправлено</option>
              <option value="FAILED">Ошибка</option>
              <option value="PENDING">Ожидает</option>
              <option value="SKIPPED">Пропущено</option>
            </Select>
          </div>
        }
      />

      <Card>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">
            Здесь появятся события, отправленные в рекламные платформы. Обновляется автоматически.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="px-2 py-2">Время</th>
                  <th className="px-2 py-2">Событие</th>
                  <th className="px-2 py-2">Сущность CRM</th>
                  <th className="px-2 py-2">Статус</th>
                  <th className="px-2 py-2">Попытки</th>
                  <th className="px-2 py-2">Ошибка</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 align-top">
                    <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                      {new Date(log.createdAt).toLocaleString('ru-RU')}
                    </td>
                    <td className="px-2 py-2 font-medium">{log.eventName}</td>
                    <td className="px-2 py-2">{log.crmEntityId ?? '—'}</td>
                    <td className="px-2 py-2">
                      <Badge value={log.status} />
                    </td>
                    <td className="px-2 py-2">{log.attempts}</td>
                    <td className="max-w-md px-2 py-2 text-xs text-red-600">{log.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
