import { useState } from 'react';
import { Button, Card, DataTable, Dialog, PreferencesControls, useToast } from '../../components/ui';
import { useI18n } from '../../i18n/i18n-provider';

export function AppearancePage() {
  const { t } = useI18n();
  const { notify } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const rows = [
    { id: 'a', name: t('pages.sampleOne'), enabled: true },
    { id: 'b', name: t('pages.sampleTwo'), enabled: false },
  ];
  return <div className="appearance-page">
    <Card title={t('pages.appearance')} description={t('pages.appearanceDesc')}>
      <PreferencesControls/>
    </Card>
    <Card title={t('pages.uiDemo')} description={t('pages.uiDemoNote')}>
      <div className="ui-demo-actions">
        <Button type="button" onClick={() => setDialogOpen(true)}>{t('pages.openDialog')}</Button>
        <Button type="button" variant="secondary"
          onClick={() => notify({ title: t('pages.toastTitle'), tone: 'success' })}>
          {t('pages.toastDemo')}
        </Button>
      </div>
      <DataTable rows={rows} getRowKey={row => row.id} emptyLabel={t('common.noData')}
        columns={[
          { key: 'name', title: t('pages.sampleName'), render: row => row.name },
          { key: 'status', title: t('pages.sampleStatus'),
            render: row => row.enabled ? t('pages.enabled') : t('pages.disabled') },
        ]}/>
    </Card>
    <Dialog open={dialogOpen} title={t('pages.dialogTitle')} closeLabel={t('common.close')}
      onClose={() => setDialogOpen(false)}
      footer={<Button type="button" onClick={() => setDialogOpen(false)}>{t('common.close')}</Button>}>
      <p>{t('pages.dialogBody')}</p>
    </Dialog>
  </div>;
}
