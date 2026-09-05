import base64,json,os
from openai import OpenAI


def analyze_ar_component(image_base64:str,mime_type:str,point:dict,question:str,context:dict|None=None)->dict:
    if not image_base64:
        raise ValueError('A camera frame is required.')
    key=os.getenv('OPENAI_API_KEY')
    if not key:
        return {
            'identified_part':'Selected component',
            'answer':'AI vision is not configured on the RepairPilot server.',
            'confidence':0.0,
            'guided_steps':[],
            'safety_notes':[]
        }
    client=OpenAI(api_key=key)
    schema={
      'type':'object','additionalProperties':False,
      'required':['identified_part','answer','confidence','guided_steps','safety_notes'],
      'properties':{
        'identified_part':{'type':'string'},
        'answer':{'type':'string'},
        'confidence':{'type':'number','minimum':0,'maximum':1},
        'guided_steps':{'type':'array','items':{
          'type':'object','additionalProperties':False,
          'required':['instruction','target_label','target_hint'],
          'properties':{
            'instruction':{'type':'string'},
            'target_label':{'type':'string'},
            'target_hint':{'type':'string'}
          }
        }},
        'safety_notes':{'type':'array','items':{'type':'string'}}
      }
    }
    x=float(point.get('x',0.5)); y=float(point.get('y',0.5))
    ctx=json.dumps(context or {},ensure_ascii=False)[:4000]
    prompt=f'''The user is viewing equipment through RepairPilot AR. The selected component is at normalized portrait-screen coordinate x={x:.3f}, y={y:.3f} (0,0 top-left; 1,1 bottom-right).
User question: {question}
Known equipment/session context: {ctx}
Identify the specific selected component from the full image and answer the question conservatively. Do not invent model-specific procedures, hidden fasteners, torque values, or specifications. If the user asks how to remove, test, replace, install, or repair it, provide a short step-by-step guided procedure ONLY when visually/contextually supportable. Each guided step must name the thing that should be highlighted next (bolt, connector, clamp, part, etc.) and give a visual target hint. Put prerequisites such as disconnecting power, cooling, pressure relief, support, or lockout in safety_notes when relevant. If exact equipment identity is needed for a safe procedure and is not known, say so in answer and keep guided_steps empty.'''
    response=client.responses.create(
      model=os.getenv('REPAIRPILOT_VISION_MODEL','gpt-5.6-terra'),
      instructions='You are RepairPilot AR, a conservative mechanical repair assistant. Ground all visual claims in the supplied image and user-selected point.',
      input=[{'role':'user','content':[
        {'type':'input_text','text':prompt},
        {'type':'input_image','image_url':f'data:{mime_type or "image/jpeg"};base64,{image_base64}'}
      ]}],
      text={'format':{'type':'json_schema','name':'ar_component_answer','strict':True,'schema':schema}},
      max_output_tokens=1500,store=False
    )
    return json.loads(response.output_text)
