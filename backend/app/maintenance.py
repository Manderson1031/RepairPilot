import json,os
from openai import OpenAI


def lookup_manufacturer_maintenance(equipment:dict)->dict:
    manufacturer=str(equipment.get('manufacturer') or '').strip()
    model=str(equipment.get('model') or '').strip()
    serial=str(equipment.get('serial') or '').strip()
    name=str(equipment.get('name') or '').strip()
    if not manufacturer and not model:
        return {'equipment_name':name,'manufacturer':manufacturer,'model':model,'schedule':[],'materials':[],'notes':['Add the manufacturer and model to this equipment before looking up an official maintenance schedule.']}
    if not os.getenv('OPENAI_API_KEY'):
        return {'equipment_name':name,'manufacturer':manufacturer,'model':model,'schedule':[],'materials':[],'notes':['AI/web maintenance lookup is not configured on the RepairPilot server.']}
    schema={
      'type':'object','additionalProperties':False,
      'required':['equipment_name','manufacturer','model','schedule','materials','notes'],
      'properties':{
        'equipment_name':{'type':'string'},'manufacturer':{'type':'string'},'model':{'type':'string'},
        'schedule':{'type':'array','items':{'type':'object','additionalProperties':False,'required':['service','interval','interval_hours','interval_miles','interval_days','procedure_summary','source_title','source_url'], 'properties':{
          'service':{'type':'string'},'interval':{'type':'string'},'interval_hours':{'type':['number','null']},'interval_miles':{'type':['number','null']},'interval_days':{'type':['number','null']},'procedure_summary':{'type':'string'},'source_title':{'type':'string'},'source_url':{'type':'string'}
        }}},
        'materials':{'type':'array','items':{'type':'object','additionalProperties':False,'required':['item','manufacturer_spec','part_number','quantity_capacity','source_title','source_url','purchase_query'], 'properties':{
          'item':{'type':'string'},'manufacturer_spec':{'type':'string'},'part_number':{'type':'string'},'quantity_capacity':{'type':'string'},'source_title':{'type':'string'},'source_url':{'type':'string'},'purchase_query':{'type':'string'}
        }}},
        'notes':{'type':'array','items':{'type':'string'}}
      }
    }
    identity=' | '.join(x for x in [name,manufacturer,model,('serial '+serial if serial else '')] if x)
    client=OpenAI(api_key=os.environ['OPENAI_API_KEY'])
    try:
        response=client.responses.create(
          model=os.getenv('REPAIRPILOT_MAINTENANCE_MODEL','gpt-5.6'),
          tools=[{'type':'web_search'}],
          instructions='''You are RepairPilot Maintenance. Research only manufacturer/official technical documentation when possible. Do not invent service intervals, capacities, fluid specifications, filter numbers, torque values, or part numbers. If the exact model/configuration cannot be verified, leave uncertain fields blank and explain in notes. Distinguish hours, mileage, and calendar intervals. For materials, preserve exact manufacturer specifications and OEM part numbers when supported. purchase_query should be a useful shopping search for the verified spec/part, but never claim a seller listing is compatible unless the manufacturer evidence supports it.''',
          input=f'''Find the manufacturer-recommended maintenance schedule and specified fluids, filters, lubricants, plugs, belts, and service materials for this exact equipment when possible:\n{identity}\nPrefer the manufacturer's owner/operator/service manual, official parts catalog, official support pages, or official technical bulletins. Return source URLs for every schedule/material item.''',
          text={'format':{'type':'json_schema','name':'maintenance_lookup','strict':True,'schema':schema}},
          max_output_tokens=3000,store=False
        )
        return json.loads(response.output_text)
    except Exception as exc:
        return {'equipment_name':name,'manufacturer':manufacturer,'model':model,'schedule':[],'materials':[],'notes':[f'Manufacturer lookup could not be completed: {str(exc)[:240]}']}
