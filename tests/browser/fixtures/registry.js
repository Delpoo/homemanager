/** Invented registry shared by pure tests and browser fixtures; no household data. */
export function syntheticRegistry() {
  const states = {},
    entities = {},
    devices = {},
    areas = { kitchen: { name: 'Cocina' }, living: { name: 'Living' }, bedroom: { name: 'Dormitorio' } };
  function add(deviceId, key, name, deviceClass, value = '10', unit = '', extra = {}) {
    const id = `${deviceClass === 'climate' ? 'climate' : 'sensor'}.${key}`;
    entities[id] = { device_id: deviceId, has_entity_name: true, platform: 'synthetic', ...extra };
    states[id] = {
      state: value,
      attributes: { friendly_name: name, device_class: deviceClass, unit_of_measurement: unit },
      last_updated: '2026-10-30T00:00:00Z',
    };
    return id;
  }
  devices['meter-six'] = {
    name: 'Energy_meter_6ch',
    name_by_user: 'Medidor de energía',
    area_id: 'kitchen',
    manufacturer: 'Ejemplo',
    model: 'Seis canales',
  };
  add('meter-six', 'energy_meter_6ch_total_power', 'Medidor de energía Potencia total', 'power', '1.79', 'kW');
  add('meter-six', 'energy_meter_6ch_today', 'Medidor de energía Energía de hoy', 'energy', '8.4', 'kWh');
  for (let channel = 1; channel <= 6; channel++) {
    add(
      'meter-six',
      `energy_meter_6ch_channel_${channel}_power`,
      `Energy_meter_6ch_Channel_${channel}_Power`,
      'power',
      String(700 - channel * 60),
      'W',
    );
    add(
      'meter-six',
      `energy_meter_6ch_channel_${channel}_energy`,
      `Energy_meter_6ch_Channel_${channel}_Energía de hoy`,
      'energy',
      String(channel * 0.4),
      'kWh',
    );
  }
  add('meter-six', 'energy_meter_voltage', 'Medidor de energía Tensión', 'voltage', '228', 'V');
  add('meter-six', 'energy_meter_current', 'Medidor de energía Corriente', 'current', '7.8', 'A');
  for (const [key, extra] of [
    ['diagnostic', { entity_category: 'diagnostic' }],
    ['configuration', { entity_category: 'config' }],
    ['hidden', { hidden: true }],
    ['disabled', { disabled: true }],
  ])
    add('meter-six', `energy_meter_${key}`, `DO_NOT_SHOW_${key}`, 'power', '0', 'W', extra);
  for (let index = 2; index <= 15; index++) {
    const id = `device-${index}`,
      name = index === 2 ? 'Sensor de ambiente' : index === 3 ? 'Aire acondicionado' : `Ambiente_${index}`;
    devices[id] = {
      name,
      name_by_user: index === 4 ? 'Lámpara de lectura' : null,
      area_id: index % 3 === 0 ? 'bedroom' : index % 2 === 0 ? 'living' : null,
      manufacturer: index === 5 ? 'Fabricante Especial' : 'Ejemplo',
      model: `Modelo ${index}`,
    };
    add(id, `synthetic_${index}_temperature`, `${name} Temperatura`, 'temperature', '23.4', '°C');
    add(id, `synthetic_${index}_humidity`, `${name} Humedad`, 'humidity', '52', '%');
    add(
      id,
      `synthetic_${index}_battery`,
      `${name} Batería`,
      'battery',
      '90',
      '%',
      index === 15 ? { entity_category: 'diagnostic' } : {},
    );
    add(id, `synthetic_${index}_signal`, `DO_NOT_SHOW_signal_${index}`, 'power', '100', 'W', {
      entity_category: 'diagnostic',
    });
    add(id, `synthetic_${index}_setting`, `DO_NOT_SHOW_setting_${index}`, 'power', '100', 'W', {
      entity_category: 'config',
    });
  }
  add('device-3', 'synthetic_air', 'Aire acondicionado', 'climate', 'cool');
  return { states, entities, devices, areas, language: 'es', locale: { language: 'es-AR' } };
}
